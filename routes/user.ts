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

// 🔁 GET /api/me
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { medias: true },
    });

    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const followersCount = await prisma.follow.count({ where: { followingId: userId } });
    const followingCount = await prisma.follow.count({ where: { followerId: userId } });

    res.json({ ...user, followersCount, followingCount });
  } catch (error) {
    console.error('❌ Erreur /me :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 🔍 GET /api/users/search?q=...
router.get('/users/search', authenticateToken, async (req: Request, res: Response) => {
  const query = req.query.q as string;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Requête trop courte' });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        username: { contains: query, mode: 'insensitive' },
      },
      select: { id: true, username: true, avatarUrl: true, bio: true },
    });

    res.json(users);
  } catch (error) {
    console.error('❌ Erreur recherche utilisateurs :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 🧑‍💻 PUT /api/user/update
router.put('/update', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { username, bio, avatarUrl, isPrivate } = req.body;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Nom d’utilisateur invalide' });
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
    });

    if (existing) return res.status(400).json({ error: 'Nom d’utilisateur déjà utilisé' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { username, bio, avatarUrl, isPrivate },
    });

    res.json({ message: 'Profil mis à jour', user });
  } catch (error) {
    console.error('❌ Erreur update user:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 🖼 POST /api/user/media/add
router.post('/media/add', authenticateToken, async (req: Request, res: Response) => {
  const { url, type } = req.body;
  const userId = Number((req as any).user.userId);

  if (!url || !['image', 'video'].includes(type)) {
    return res.status(400).json({ error: 'Champs invalides' });
  }

  try {
    const media = await prisma.media.create({
      data: { url, type, userId },
    });
    res.status(201).json(media);
  } catch (error) {
    console.error('❌ Erreur création média :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 🔍 GET /api/user/user/:username
router.get('/user/:username', authenticateToken, async (req: Request, res: Response) => {
  const currentUserId = (req as any).user.userId;
  const username = req.params.username.trim();

  try {
    const targetUser = await prisma.user.findUnique({
      where: { username },
      include: {
        medias: true,
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!targetUser) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const isOwner = currentUserId === targetUser.id;

    const friendship = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: currentUserId },
        ],
        status: 'accepted',
      },
    });

    const isFriend = !!friendship;

    const pendingRequest = await prisma.friendRequest.findFirst({
      where: {
        senderId: currentUserId,
        receiverId: targetUser.id,
        status: 'pending',
      },
    });

    const hasPendingFriendRequest = !!pendingRequest;

    if (!targetUser.isPrivate || isFriend || isOwner) {
      const { email, password, ...safeUser } = targetUser;
      return res.json({
        ...safeUser,
        isPrivate: targetUser.isPrivate,
        isFriend,
        hasPendingFriendRequest,
        followersCount: targetUser._count.followers,
        followingCount: targetUser._count.following,
      });
    }

    return res.json({
      username: targetUser.username,
      avatarUrl: targetUser.avatarUrl,
      isPrivate: true,
      isFriend,
      hasPendingFriendRequest,
      followersCount: targetUser._count.followers,
      followingCount: targetUser._count.following,
    });
  } catch (error) {
    console.error('❌ Erreur profil public :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 🤝 POST /api/friends/request
router.post('/friends/request', authenticateToken, async (req: Request, res: Response) => {
  const senderId = (req as any).user.userId;
  const { toUsername } = req.body;

  try {
    const receiver = await prisma.user.findUnique({
      where: { username: toUsername },
    });

    if (!receiver) return res.status(404).json({ error: 'Utilisateur cible introuvable' });
    if (receiver.id === senderId) return res.status(400).json({ error: 'Impossible de s’ajouter soi-même' });

    const existing = await prisma.friendRequest.findFirst({
      where: {
        senderId,
        receiverId: receiver.id,
        status: 'pending',
      },
    });

    if (existing) return res.status(400).json({ error: 'Demande déjà envoyée' });

    const request = await prisma.friendRequest.create({
      data: {
        senderId,
        receiverId: receiver.id,
      },
    });

    res.status(201).json(request);
  } catch (error) {
    console.error('❌ Erreur envoi demande ami :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 📬 GET /api/user/friends/requests
router.get('/friends/requests', authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;

  try {
    const received = await prisma.friendRequest.findMany({
      where: { receiverId: userId, status: 'pending' },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    const sent = await prisma.friendRequest.findMany({
      where: { senderId: userId, status: 'pending' },
      include: {
        receiver: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    res.json({ received, sent });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ POST /api/user/friends/respond
router.post('/friends/respond', authenticateToken, async (req, res) => {
  const receiverId = (req as any).user.userId;
  const { requestId, action } = req.body;

  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'Action invalide' });
  }

  try {
    const request = await prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.receiverId !== receiverId || request.status !== 'pending') {
      return res.status(404).json({ error: 'Demande non valide' });
    }

    const updated = await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: action === 'accept' ? 'accepted' : 'declined' },
    });

    if (action === 'accept') {
      await prisma.follow.createMany({
        data: [
          { followerId: request.senderId, followingId: request.receiverId },
          { followerId: request.receiverId, followingId: request.senderId },
        ],
        skipDuplicates: true,
      });
    }

    res.json({ message: `Demande ${action === 'accept' ? 'acceptée' : 'refusée'}`, request: updated });
  } catch (error) {
    console.error('❌ Erreur réponse ami :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET /api/user/friends/list
router.get('/friends/list', authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;

  try {
    const friends = await prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    const seen = new Set();
    const friendList = [];

    for (const f of friends) {
      const friend = f.sender.id === userId ? f.receiver : f.sender;
      if (!seen.has(friend.id)) {
        seen.add(friend.id);
        friendList.push(friend);
      }
    }

    res.json(friendList);
  } catch (error) {
    console.error('❌ Erreur récupération amis :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
