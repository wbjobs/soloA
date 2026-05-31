import { Router } from 'express';
import { register, login, getCurrentUser, updateUser } from '../controllers/authController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);

router.use(authenticateJWT);
router.get('/me', getCurrentUser);
router.put('/me', updateUser);

export default router;
