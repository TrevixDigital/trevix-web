import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader:false, images:{formats:["image/avif","image/webp"]}, allowedDevOrigins:["localhost","127.0.0.1","192.168.0.104","192.168.0.110",...(process.env.DEV_ALLOWED_ORIGINS??"").split(",").map(s=>s.trim()).filter(Boolean)] };
export default config;
