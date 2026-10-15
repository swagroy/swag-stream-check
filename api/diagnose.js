import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { streamerImage, userImage } = req.body;

    if (!streamerImage || !userImage) {
      return res.status(400).json({ error: '請提供主播與用戶的截圖' });
    }

    function base64ToGenerativePart(base64Data) {
      const parts = base64Data.split(';');
      const mimeType = parts[0].split(':')[1];
      const data = parts[1].split(',')[1];
      return {
        inlineData: { data, mimeType }
      };
    }

    const imageParts = [
      base64ToGenerativePart(streamerImage),
      base64ToGenerativePart(userImage)
    ];

    const prompt = `
你是一位具備多年音視頻直播技術與客服經驗的「直播串流品質診斷專家」。
我上傳了兩張圖片：第一張是「主播端推流」，第二張是「用戶端拉流」。

【核心評估指標】
- 碼率（Bitrate / kbps）：是否存在斷崖式下跌或劇烈跳動。
- 幀率（FPS）：是否嚴重掉幀。
- 丟包率（Packet Loss）：推流端 > 2-3% 即可能造成全體卡頓；拉流端丟包代表用戶本地網路不穩。
- 渲染丟幀（Render Drop）：若網路充足但畫面掉幀，通常是用戶手機 CPU/GPU 降頻（省電模式/過熱保護）。

【責任歸屬與補償原則】
1. 主播推流異常：判定為平台/主播端責任 -> 符合退鑽補償。
2. 主播推流正常、用戶拉流異常：判定為用戶本地網路或設備因素 -> 嚴格不予補償，僅提供排障建議。
3. 兩者皆正常或資訊不足：說明為瞬斷，請用戶提供具體時間點。

請務必以 JSON 格式回傳，格式如下：
{
  "faultSide": "streamer",
  "isEligibleForCompensation": true,
  "diagnosis": "這裡填寫技術診斷摘要",
  "replyScript": "這裡填寫給用戶的客服回覆話術（語氣親切，若不補償要提供省電模式、避免邊充邊看等排障建議）"
}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();

    let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'AI 分析失敗，請檢查 API Key 或稍後再試。' });
  }
}
