import { Resend } from 'resend';

const resend = new Resend('re_2tHjJsgS_B8knEBf2vnfXQNkXN91Jtssk'); // ← Ta clé API Resend

// Fonction d’envoi de l’email OTP
export async function sendVerificationEmail(to: string, username: string, code: string) {
  const { data, error } = await resend.emails.send({
    // ✅ C’EST ICI qu’il faut modifier le from:
    from: 'Next AI <no-reply@socialword.shop>', // ← Doit absolument être une adresse de TON domaine vérifié

    to,
    subject: 'Votre code de vérification',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5">
        <h2 style="color: #4f46e5;">Bonjour ${username},</h2>
        <p>Voici votre code de vérification :</p>
        <p style="font-size: 32px; font-weight: bold; color: #000;">${code}</p>
        <p>Ce code est valable pendant 10 minutes.</p>
        <p style="font-size: 12px; color: #888;">– L’équipe de SocialWord</p>
      </div>
    `,
  });

  if (error) {
    console.error('❌ Erreur Resend :', error);
  } else {
    console.log('📬 Email envoyé avec succès :', data);
  }
}
