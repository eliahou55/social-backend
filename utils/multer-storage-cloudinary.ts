import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from './cloudinary';

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext || '');
    return {
      folder: 'reseau_social',
      resource_type: isVideo ? 'video' : 'image',
    };
  }
  
});

export const upload = multer({ storage });
