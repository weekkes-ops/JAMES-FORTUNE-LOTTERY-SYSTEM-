export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({
    status: "healthy",
    keyConfigured: !!process.env.GEMINI_API_KEY,
    environment: "vercel-serverless",
  });
}
