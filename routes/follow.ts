import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from './auth'; // ✅ Import depuis ton auth.ts

const router = express.Router();
const prisma = new PrismaClient();

// ➕ Suivre un utilisateur (si public)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const currentUserId = (req as any).user.userId;
  const { targetUserId } = req.body;

  if (currentUserId === targetUserId) {
    return res.status(400).json({ error: "Tu ne peux pas te suivre toi-même" });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (target.isPrivate) {
    return res.status(403).json({ error: 'Ce profil est privé. Envoie une demande d’ami.' });
  }

  try {
    await prisma.follow.create({
      data: {
        followerId: currentUserId,
        followingId: targetUserId,
      },
    });
    return res.status(200).json({ message: 'Follow réussi' });
  } catch (err) {
    return res.status(400).json({ error: 'Tu suis déjà cet utilisateur' });
  }
});

// ❌ Unfollow
router.delete('/', authenticateToken, async (req: Request, res: Response) => {
  const currentUserId = (req as any).user.userId;
  const { targetUserId } = req.body;

  try {
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });
    return res.status(200).json({ message: 'Unfollow réussi' });
  } catch (err) {
    return res.status(404).json({ error: 'Relation de follow non trouvée' });
  }
});

// ✅ Vérifie si le user actuel suit déjà le target
router.get('/status/:targetUserId', authenticateToken, async (req: Request, res: Response) => {
  const currentUserId = (req as any).user.userId;
  const targetUserId = parseInt(req.params.targetUserId);

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'ID invalide' });
  }

  try {
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    return res.json({ isFollowing: !!follow });
  } catch (error) {
    console.error('Erreur follow status :', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
