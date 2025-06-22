import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt, { JwtPayload } from 'jsonwebtoken';

const router = express.Router();
const prisma = new PrismaClient();

// ✅ Étend Request pour inclure req.user
interface AuthenticatedRequest extends Request {
  user?: JwtPayload & { userId: number };
}

// ✅ Middleware d'authentification JWT
function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) return res.sendStatus(401);

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET non défini' });

  jwt.verify(token, secret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user as JwtPayload & { userId: number };
    next();
  });
}

// 🔍 GET /api/posts/:postId/comments — Récupérer les commentaires d’un post
router.get('/:postId/comments', async (req: Request, res: Response) => {
  const postId = Number(req.params.postId);

  try {
    const comments = await prisma.comment.findMany({
      where: { postId },
      include: {
        author: { select: { username: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des commentaires' });
  }
});

// ✏️ POST /api/posts/:postId/comments — Ajouter un commentaire à un post
router.post('/:postId/comments', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const postId = Number(req.params.postId);
  const { content } = req.body;
  const userId = req.user?.userId;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Le commentaire est vide' });
  }

  try {
    const comment = await prisma.comment.create({
      data: {
        content,
        authorId: userId!,
        postId,
      },
      include: {
        author: { select: { username: true, avatarUrl: true } }
      }
    });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de l’envoi du commentaire' });
  }
});

export default router;
