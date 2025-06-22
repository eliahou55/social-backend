import express from 'express';
import { upload } from '../utils/multer-storage-cloudinary';

const router = express.Router();

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const file = req.file as Express.Multer.File & { path: string };
    res.json({ url: file?.path });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Upload échoué' });
  }
});

export default router;
