import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const router = express.Router();
const prisma = new PrismaClient();

// ✅ Middleware JWT pour routes protégées
function authenticateToken(req: Request, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET non défini' });

  jwt.verify(token, secret, (err, user) => {
    if (err) return res.sendStatus(403);
    (req as any).user = user;
    next();
  });
}

// 🔁 GET /api/posts — Récupérer tous les posts avec auteur + commentaires + likes
router.get('/', async (req: Request, res: Response) => {
  try {
    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: {
            username: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true, // ✅ Ajouté ici
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des posts' });
  }
});

// 📝 POST /api/posts — Créer un nouveau post (authentifié)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  console.log("📥 Body reçu par le backend :", req.body);
  const { content, mediaUrl } = req.body;
  const userId = (req as any).user.userId;

  try {
    const post = await prisma.post.create({
      data: {
        content,
        mediaUrl,
        authorId: userId,
      },
      include: {
        author: {
          select: {
            username: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true, // ✅ Ajouté ici aussi
          },
        },
      },
    });

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la création du post' });
  }
});

export default router;
