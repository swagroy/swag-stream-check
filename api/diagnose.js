import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const maxDuration = 60; // 允許較長的 Vercel 處理時間，避免超時中斷

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
    const { streamerImage, userImage, ticketPrice } = req.body;

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

    // 動態加入票價資訊判斷
    const ticketCondition = ticketPrice && ticketPrice.trim() !== '' 
      ? `用戶本次有輸入直播門票金額為：「${ticketPrice} 鑽」。` 
      : `用戶未提供直播門票金額。`;

    const prompt = `
你是一位具備多年音視頻直播技術與客服經驗的「直播串流品質診斷專家」。
我上傳了兩張圖片：第一張是「主播端推流」，第二張是「用戶端拉流」。

【附加資訊】
${ticketCondition}

【核心評估指標】
- 碼率（Bitrate / kbps）：是否存在斷崖式下跌或劇烈跳動。
- 幀率（FPS）：是否嚴重掉幀。
- 丟包率（Packet Loss）：推流端 > 2-3% 即可能造成全體卡頓；拉流端丟包代表用戶本地網路不穩。
- 渲染丟幀（Render Drop）：若網路充足但畫面掉幀，通常是用戶手機 CPU/GPU 降頻（省電模式/過熱保護）。

【責任歸屬與話術補償原則】(非常重要)
1. 主播推流異常：判定為平台/主播端責任 -> 符合退鑽補償。
   *若上方【附加資訊】有提供門票金額，請務必在回覆話術中加入安撫語句，明確寫出「我們將退還您本次扣除的 ${ticketPrice || 'X'} 鑽石」。若沒提供金額則一般安撫即可。
2. 主播推流正常、用戶拉流異常：判定為用戶本地網路或設備因素 -> 嚴格不予補償。
   *話術中「絕對不可提及任何退鑽或金額」，僅提供網路檢查、關閉省電模式等排障建議。
3. 兩者皆正常或資訊不足：說明為瞬斷，請用戶提供具體時間點。

請務必以 JSON 格式回傳，格式如下：
{
  "faultSide": "streamer",
  "isEligibleForCompensation": true,
  "diagnosis": "這裡填寫技術診斷摘要",
  "replyScript": "這裡填寫給用戶的客服回覆話術"
}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();

    let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message || 'AI 分析失敗，請檢查 API Key 或稍後再試。' });
  }
}
