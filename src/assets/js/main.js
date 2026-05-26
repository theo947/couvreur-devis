/* Couvreur Devis — JS Principal */

document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('active'));
  }

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

    function goToStep(n) {
      steps.forEach(s => s.classList.toggle('form-step-active', +s.dataset.step === n));
      indicators.forEach(ind => {
        const step = +ind.dataset.step;
        ind.classList.toggle('active', step === n);
        ind.classList.toggle('done', step < n);
      });
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
    const villeInput = form && form.querySelector('.ville-input');
    if (!villeInput) return;

    let debounce;
    cpInput.addEventListener('input', () => {
      clearTimeout(debounce);
      const cp = cpInput.value.replace(/\D/g, '');
      if (cp.length !== 5) return;
      debounce = setTimeout(() => {
        fetch('https://geo.api.gouv.fr/communes?codePostal=' + cp + '&fields=nom&limit=5')
          .then(r => r.ok ? r.json() : [])
          .then(data => {
            if (data.length === 1) {
              villeInput.value = data[0].nom;
            } else if (data.length > 1) {
              villeInput.value = data[0].nom;
              villeInput.focus();
              villeInput.select();
            }
          })
          .catch(() => {});
      }, 150);
    });
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
