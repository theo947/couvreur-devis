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

  // Quote form — submit via fetch (AJAX) to FormSubmit.co
  document.querySelectorAll('.quote-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const entries = Object.fromEntries(data);

      // Basic validation
      if (!entries.nom || !entries.email || !entries.ville) {
        alert('Veuillez remplir les champs obligatoires : nom, email et ville.');
        return;
      }

      // Disable button during send
      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Envoi en cours...';
      btn.disabled = true;

      fetch(form.action, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(data)),
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      })
      .then(res => {
        if (res.ok) {
          form.innerHTML = `
            <div style="text-align:center;padding:2rem 0">
              <div style="font-size:3rem;margin-bottom:1rem">✓</div>
              <h3 style="margin-bottom:.5rem;color:#27ae60">Demande envoyée !</h3>
              <p style="color:#495057">Vous recevrez jusqu'à 3 devis gratuits sous 48h.</p>
            </div>
          `;
        } else {
          throw new Error('Erreur serveur');
        }
      })
      .catch(() => {
        alert('Une erreur est survenue. Veuillez réessayer ou nous appeler directement.');
        btn.textContent = originalText;
        btn.disabled = false;
      });
    });
  });

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
