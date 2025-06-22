import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { sendVerificationEmail } from '../mailer'; // ← nouvelle importation Resend

const router = express.Router();
const prisma = new PrismaClient();

/** ---------- HELPER : Génère un code à 4 chiffres ---------- */
const genCode = () => crypto.randomInt(1000, 9999).toString();

/* ------------------------------------------------------------------ */
/*                         ROUTE /api/register                        */
/* ------------------------------------------------------------------ */
router.post('/register', async (req: Request, res: Response) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const cleanUsername = username.trim().toLowerCase();

  // Vérifie que le username est valide (lettres, chiffres, underscores)
  if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
    return res.status(400).json({
      error: "Nom d'utilisateur invalide (3-20 caractères alphanumériques ou _)",
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      username: cleanUsername,
      password: hashed,
      // isVerified par défaut false
    },
  });

  // 🔐 Génère et stocke le code OTP
  const code = genCode();
  await prisma.verificationCode.create({
    data: {
      email,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // 📤 Envoie le mail de vérification
  await sendVerificationEmail(email, cleanUsername, code);

  return res.status(201).json({
    message: 'Inscription OK – vérifie ta boîte mail pour le code',
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
    },
  });
});


/* ------------------------------------------------------------------ */
/*                          ROUTE /api/verify                         */
/* ------------------------------------------------------------------ */
// 👇 Remplace TOUTE la route /api/verify par celle-ci :
router.post('/verify', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Missing email or code' });

  const record = await prisma.verificationCode.findFirst({ where: { email, code } });
  if (!record || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Code incorrect ou expiré' });
  }

  const user = await prisma.user.update({ where: { email }, data: { isVerified: true } });
  await prisma.verificationCode.deleteMany({ where: { email } });

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );

  return res.json({
    message: 'Vérification réussie',
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
    },
  });
});


/* ------------------------------------------------------------------ */
/*                           ROUTE /api/login                         */
/* ------------------------------------------------------------------ */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (!user.isVerified) return res.status(403).json({ error: 'Account not verified' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });

  /* Génère un JWT (pratique pour la session frontend) */
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );

  return res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, email: user.email, username: user.username },
  });
});

/* ------------------------------------------------------------------ */
/*                 🔐 Middleware : Authentifie par JWT                 */
/* ------------------------------------------------------------------ */
export const authenticateToken = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token manquant' });

  jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    (req as any).user = user;
    next();
  });
};


export default router;
