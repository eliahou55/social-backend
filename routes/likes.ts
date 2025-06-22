import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt, { JwtPayload } from 'jsonwebtoken';

const router = express.Router();
const prisma = new PrismaClient();

// 🔐 Type pour req.user
interface AuthenticatedRequest extends Request {
  user?: JwtPayload & { userId: number };
}

// 🔐 Middleware d’authentification
function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!token || !secret) return res.sendStatus(401);

  jwt.verify(token, secret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user as JwtPayload & { userId: number };
    next();
  });
}

// ✅ POST /api/likes/:postId — Liker un post
router.post('/:postId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const postId = Number(req.params.postId);
  const userId = req.user?.userId;
  if (!userId) return res.sendStatus(401);

  try {
    const existing = await prisma.like.findFirst({ where: { postId, userId } });
    if (existing) return res.status(400).json({ error: 'Déjà liké' });

    await prisma.like.create({
      data: { postId, userId }
    });

    const updatedPost = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        _count: { select: { likes: true } }
      }
    });

    res.status(201).json(updatedPost);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du like' });
  }
});

// ✅ DELETE /api/likes/:postId — Unlike
router.delete('/:postId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const postId = Number(req.params.postId);
  const userId = req.user?.userId;
  if (!userId) return res.sendStatus(401);

  try {
    await prisma.like.deleteMany({ where: { postId, userId } });

    const updatedPost = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        _count: { select: { likes: true } }
      }
    });

    res.json(updatedPost);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du unlike' });
  }
});

// ✅ GET /api/likes — Récupère tous les postId likés par l’utilisateur
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.sendStatus(401);

  try {
    const likes = await prisma.like.findMany({
      where: { userId },
      select: { postId: true }
    });

    const likedPostIds = likes.map((like) => like.postId);
    res.json({ likedPostIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des likes' });
  }
});

export default router;
