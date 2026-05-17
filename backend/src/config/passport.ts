// import passport from "passport";
// import { Strategy as GoogleStrategy } from "passport-google-oauth20";
// import { User } from "../models/user.schema.ts";
// import dotenv from "dotenv";
// dotenv.config();
// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID!,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
//       callbackURL: process.env.GOOGLE_CALLBACK_URL,
//     },
//     async (_, __, profile, done) => {
//       let user = await User.findOne({ googleId: profile.id });

//       if (!user) {
//         user = await User.create({
//           name: profile.displayName,
//           email: profile.emails?.[0].value,
//           googleId: profile.id,
//           username: profile.id,
//         });
//       }

//       done(null, user);
//     }
//   )
// );
