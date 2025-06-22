import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import postRoutes from './routes/posts';
import userRoutes from './routes/user';
import messageRoutes from './routes/messages';
import commentRoutes from './routes/comments';
import likeRoutes from './routes/likes';
import uploadRoutes from './routes/upload';


import followRoutes from './routes/follow'





const app = express();
const prisma = new PrismaClient();

// 🌐 Logger global
app.use((req, res, next) => {
  console.log('🛰 Requête reçue :', req.method, req.path);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// 📦 Routes montées sur /api/*
app.use('/api', authRoutes);           // /api/login, /api/register
app.use('/api/posts', postRoutes);     // /api/posts
app.use('/api', userRoutes);           // /api/me, /api/users/search
app.use('/api/user', userRoutes);      // /api/user/media/add
app.use('/api/messages', messageRoutes);
app.use('/api/posts', commentRoutes); 
app.use('/api/likes', likeRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/follow', followRoutes)


app.listen(3000, () => {
  console.log('🚀 Server is running at http://localhost:3000');
});
