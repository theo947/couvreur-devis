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

  // Quote form — submit via fetch (AJAX) vers la Netlify Function ViteUnDevis
  document.querySelectorAll('.quote-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Laisse la validation HTML5 native gérer les champs requis
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

  // Confirmation inline + spinner ViteUnDevis (améliore le taux de validation par SMS)
  function showConfirmation(form, devisId, devisHash) {
    const hasSpinner = devisId && devisHash;
    form.innerHTML = `
      <div style="text-align:center;padding:2rem 0">
        <div style="font-size:3rem;margin-bottom:1rem">✓</div>
        <h3 style="margin-bottom:.5rem;color:#27ae60">Demande enregistrée !</h3>
        <p style="color:#495057">Un couvreur va vous recontacter rapidement. Pensez à valider votre demande si vous recevez un SMS.</p>
        ${hasSpinner ? '<div id="vud_spin_775925" style="margin-top:1.5rem"></div>' : ''}
      </div>
    `;
    if (hasSpinner) {
      const vudJs = document.createElement('script');
      vudJs.type = 'text/javascript';
      vudJs.src = 'https://www.viteundevis.com/mb/spinner.php?devis_id=' +
        encodeURIComponent(devisId) + '&devis_hash=' + encodeURIComponent(devisHash) + '&box=775925';
      const s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(vudJs, s);
    }
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
