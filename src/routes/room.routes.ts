import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { AppError } from "@/lib";
import { listRoomMessages } from "@/services";

const router = Router();

router.use(authenticate);

// GET /api/rooms/:roomId/messages?limit= — persisted room-chat history
router.get("/:roomId/messages", async (req, res) => {
  const roomId = req.params.roomId;
  if (!roomId || roomId.length > 128) {
    throw new AppError(400, "Invalid room id");
  }
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
  res.json(await listRoomMessages(roomId, limit));
});

export default router;
