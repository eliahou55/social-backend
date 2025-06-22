import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const router = express.Router();
const prisma = new PrismaClient();

// 🔐 Middleware JWT
function authenticateToken(req: Request, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
    if (err) return res.sendStatus(403);
    (req as any).user = user;
    next();
  });
}

// 🧾 Conversations
router.get('/conversations', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: { sender: true, receiver: true },
      orderBy: { createdAt: 'desc' },
    });

    const seen = new Set();
    const conversations = [];

    for (const msg of messages) {
      const otherUser = msg.senderId === userId ? msg.receiver : msg.sender;
      if (!seen.has(otherUser.id)) {
        seen.add(otherUser.id);
        conversations.push({
          friend: {
            id: otherUser.id,
            username: otherUser.username,
            avatarUrl: otherUser.avatarUrl,
          },
          lastMessage: msg,
        });
      }
    }

    res.json(conversations);
  } catch (error) {
    console.error('❌ Erreur /conversations :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Envoi message
router.post('/send', authenticateToken, async (req: Request, res: Response) => {
  const senderId = (req as any).user.userId;
  const { receiverId, content } = req.body;

  if (!receiverId || !content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Champs invalides' });
  }

  try {
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const isFriend = await prisma.friendRequest.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (receiver.isPrivate && !isFriend) {
      // 🕵️ Vérifier si une conversation existe déjà
      const existingMessages = await prisma.message.findFirst({
        where: {
          OR: [
            { senderId, receiverId: receiver.id },
            { senderId: receiver.id, receiverId: senderId },
          ],
        },
      });

      if (!existingMessages) {
        return res.status(403).json({
          error: 'Ce profil est privé. Vous devez être amis pour discuter.',
        });
      }
    }

    const message = await prisma.message.create({
      data: { senderId, receiverId, content },
    });

    console.log('✅ Message envoyé à', receiver.username);
    res.status(201).json(message);
  } catch (error) {
    console.error('❌ Erreur envoi message :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 📩 Voir les messages
router.get('/:userId', authenticateToken, async (req: Request, res: Response) => {
  const currentUserId = (req as any).user.userId;
  const otherUserId = parseInt(req.params.userId);
  if (isNaN(otherUserId)) return res.status(400).json({ error: 'ID utilisateur invalide' });

  try {
    const receiver = await prisma.user.findUnique({ where: { id: otherUserId } });
    if (!receiver) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const isFriend = await prisma.friendRequest.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId },
        ],
      },
    });

    if (receiver.isPrivate && !isFriend && receiver.id !== currentUserId) {
      const existingMessages = await prisma.message.findFirst({
        where: {
          OR: [
            { senderId: currentUserId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: currentUserId },
          ],
        },
      });

      if (!existingMessages) {
        return res.status(403).json({
          error: 'Ce profil est privé. Vous devez être amis pour voir cette discussion.',
        });
      }
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (error) {
    console.error('❌ Erreur messages :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
