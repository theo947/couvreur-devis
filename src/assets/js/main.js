/* Couvreur Devis — JS Principal */

document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu slide-in
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.main-nav');
  const overlay = document.querySelector('.mobile-overlay');
  const closeBtn = document.querySelector('.mobile-close');
  function openMenu() {
    nav && nav.classList.add('active');
    overlay && overlay.classList.add('active');
    toggle && toggle.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    nav && nav.classList.remove('active');
    overlay && overlay.classList.remove('active');
    toggle && toggle.classList.remove('active');
    document.body.style.overflow = '';
  }
  if (toggle) toggle.addEventListener('click', () => nav.classList.contains('active') ? closeMenu() : openMenu());
  if (overlay) overlay.addEventListener('click', closeMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (nav) nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

  // Mega menu: toggle on click (mobile accordion + desktop fallback)
  document.querySelectorAll('.nav-dropdown-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mega = btn.nextElementSibling;
      if (!mega) return;
      const isOpen = mega.classList.contains('active');
      mega.classList.toggle('active', !isOpen);
      btn.setAttribute('aria-expanded', !isOpen);
    });
  });
  // Close mega menu when clicking outside (desktop)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.mega-menu.active').forEach(m => {
        m.classList.remove('active');
        const btn = m.previousElementSibling;
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }
  });

  // FAQ : <details>/<summary> natif — ferme les autres à l'ouverture d'un item
  document.querySelectorAll('.faq-section').forEach(section => {
    section.addEventListener('toggle', e => {
      if (e.target.open) {
        section.querySelectorAll('.faq-item[open]').forEach(d => {
          if (d !== e.target) d.removeAttribute('open');
        });
      }
    }, true);
  });

  // --- Multi-step form logic ---
  document.querySelectorAll('.quote-form-card').forEach(card => {
    const form = card.querySelector('.quote-form');
    if (!form) return;
    const steps = form.querySelectorAll('.form-step');
    const indicators = card.querySelectorAll('.form-step-indicator');

    let currentN = 1;
    function goToStep(n) {
      const direction = n > currentN ? 'left' : 'right';
      const currentEl = form.querySelector('.form-step-active');
      if (currentEl && +currentEl.dataset.step !== n) {
        currentEl.classList.remove('form-step-active');
        currentEl.classList.add('slide-out-' + direction);
        currentEl.addEventListener('animationend', () => {
          currentEl.classList.remove('slide-out-' + direction);
        }, { once: true });
      }
      steps.forEach(s => {
        if (+s.dataset.step === n) s.classList.add('form-step-active');
        else if (s !== currentEl) s.classList.remove('form-step-active');
      });
      indicators.forEach(ind => {
        const step = +ind.dataset.step;
        ind.classList.toggle('active', step === n);
        ind.classList.toggle('done', step < n);
      });
      currentN = n;
    }

    card.addEventListener('click', e => {
      const nextBtn = e.target.closest('.form-next-btn');
      if (nextBtn) {
        const currentStep = nextBtn.closest('.form-step');
        const fields = currentStep.querySelectorAll('[required]');
        let firstInvalid = null;
        fields.forEach(f => {
          if (!f.checkValidity() && !firstInvalid) firstInvalid = f;
        });
        if (firstInvalid) {
          firstInvalid.reportValidity();
          return;
        }
        goToStep(+nextBtn.dataset.next);
        return;
      }
      const backBtn = e.target.closest('.form-back-btn');
      if (backBtn) {
        goToStep(+backBtn.dataset.prev);
      }
    });
  });

  // --- CP → Ville autocomplete via geo.api.gouv.fr ---
  document.querySelectorAll('.cp-input').forEach(cpInput => {
    const form = cpInput.closest('form');
    if (!form || !form.querySelector('.ville-input')) return;
    const villeId = form.querySelector('.ville-input').id;

    function getVilleEl() {
      return document.getElementById(villeId);
    }

    let debounce;
    cpInput.addEventListener('input', () => {
      clearTimeout(debounce);
      const cp = cpInput.value.replace(/\D/g, '');
      if (cp.length !== 5) return;
      debounce = setTimeout(() => {
        fetch('https://geo.api.gouv.fr/communes?codePostal=' + cp + '&fields=nom&limit=20')
          .then(r => r.ok ? r.json() : [])
          .then(data => {
            if (!data.length) return;
            if (data.length === 1) {
              restoreInput(data[0].nom);
            } else {
              swapToSelect(data);
            }
          })
          .catch(() => {});
      }, 150);
    });

    function swapToSelect(communes) {
      const current = getVilleEl();
      if (!current) return;
      const sel = document.createElement('select');
      sel.name = current.name;
      sel.id = current.id;
      sel.className = current.className;
      sel.required = current.required;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choisissez votre commune';
      placeholder.disabled = true;
      placeholder.selected = true;
      sel.appendChild(placeholder);
      communes.sort((a, b) => a.nom.localeCompare(b.nom)).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.nom;
        opt.textContent = c.nom;
        sel.appendChild(opt);
      });
      current.replaceWith(sel);
      sel.focus();
    }

    function restoreInput(value) {
      const current = getVilleEl();
      if (!current) return;
      if (current.tagName === 'SELECT') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = current.name;
        inp.id = current.id;
        inp.className = current.className;
        inp.required = current.required;
        inp.value = value;
        current.replaceWith(inp);
      } else {
        current.value = value;
      }
    }
  });

  // --- Form submit via fetch (AJAX) vers la Netlify Function ViteUnDevis ---
  document.querySelectorAll('.quote-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!form.reportValidity()) return;

      const entries = Object.fromEntries(new FormData(form));

      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Envoi en cours...';
      btn.disabled = true;

      fetch(form.action, {
        method: 'POST',
        body: JSON.stringify(entries),
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      })
      .then(res => res.json().then(body => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok || !body.ok) {
          throw new Error(body && body.message ? body.message : 'Erreur serveur');
        }
        showConfirmation(form, body.devis_id, body.devis_hash);
      })
      .catch((err) => {
        alert((err && err.message) || 'Une erreur est survenue. Veuillez réessayer ou nous appeler directement.');
        btn.textContent = originalText;
        btn.disabled = false;
      });
    });
  });

  function showConfirmation(form, devisId, devisHash) {
    const card = form.closest('.quote-form-card');
    const stepsBar = card && card.querySelector('.form-steps-bar');
    if (stepsBar) stepsBar.style.display = 'none';

    const hasSpinner = devisId && devisHash;
    form.innerHTML = `
      <div style="text-align:center;padding:2rem 0">
        <div style="font-size:3rem;margin-bottom:1rem">✓</div>
        <h3 style="margin-bottom:.5rem;color:#27ae60">Demande enregistrée !</h3>
        <p style="color:#495057">Un couvreur va vous recontacter rapidement. Pensez à valider votre demande si vous recevez un SMS.</p>
        ${hasSpinner ? '<div id="vud_spin_197782" style="margin-top:1.5rem"></div>' : ''}
      </div>
    `;
    if (hasSpinner) {
      const vudJs = document.createElement('script');
      vudJs.type = 'text/javascript';
      vudJs.src = 'https://www.viteundevis.com/mb/spinner.php?devis_id=' +
        encodeURIComponent(devisId) + '&devis_hash=' + encodeURIComponent(devisHash) + '&box=197782';
      const s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(vudJs, s);
    }
  }

  // --- Sticky CTA mobile: hide when form is visible ---
  const stickyCta = document.querySelector('.sticky-cta-mobile');
  if (stickyCta) {
    const heroForm = document.querySelector('.hero .quote-form-card');
    if (heroForm) {
      const observer = new IntersectionObserver(entries => {
        stickyCta.classList.toggle('hidden', entries[0].isIntersecting);
      }, { threshold: 0.1 });
      observer.observe(heroForm);
    }
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"], a[href^="/#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      const hash = href.includes('#') ? '#' + href.split('#')[1] : null;
      if (!hash) return;
      if (href.startsWith('/#') && window.location.pathname !== '/') return;
      const target = document.querySelector(hash);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
