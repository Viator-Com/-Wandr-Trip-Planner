import { Router } from "express";
// import passport from "passport";
import {
  signup,
  login,
  logout,
  updatePassword,
  updateEmail,
  deleteUser,
  protect,
  getMe,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);

router.use(protect);

router.get("/me", protect, getMe);

router.patch("/email", updateEmail);
router.patch("/password", updatePassword);

router.delete("/", deleteUser);

// logout
router.post("/logout", logout);

// // Google OAuth
// router.get(
//   "/google",
//   passport.authenticate("google", { scope: ["profile", "email"] }),
// );

// router.get(
//   "/google/callback",
//   passport.authenticate("google", { session: false }),
//   (req: any, res) => {
//     const token = req.user.token;

//     res.cookie("token", token, {
//       httpOnly: true,
//       secure: false,
//       sameSite: "lax",
//       maxAge: 7 * 24 * 60 * 60 * 1000,
//     });

//     res.redirect("http://localhost:8080");
//   },
// );

export default router;
