import { 
    ratelimit,
} from "../providers/upstash.js";

const rateLimitMiddleware = async (req, res, next) => {
    try {
        // Fallback to IP if req.user isn't present for some reason
        const identifier = req.user?._id?.toString() 
                            || req.ip 
                            || "anonymous";
        const { 
            success, 
            limit, 
            remaining, 
            reset 
        } = await ratelimit.limit(identifier); 

        res.setHeader("X-RateLimit-Limit", limit);
        res.setHeader("X-RateLimit-Remaining", remaining);
        res.setHeader("X-RateLimit-Reset", reset);

        if (!success) {
            return res.status(429).json({
                success: false,
                message: "Rate limit exceeded. Please slow down your CLI sync requests.",
            });
        }

        next();
    } catch (error) {
        next(error);
    }
};

export default rateLimitMiddleware;
