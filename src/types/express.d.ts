/**
 * Express global type augmentations.
 *
 * `userId` is set by authMiddleware after JWT verification.
 * `file` is provided by @types/multer (Multer.File) — no redeclaration needed here.
 */

declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

export {};