import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const maxDuration = 60; 

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

【客服話術撰寫規範】(非常重要，請嚴格遵守)
1. 開頭稱呼：一律使用「您好，」開頭即可，絕對不要寫「親愛的用戶您好」這種過於制式的詞。
2. 語氣與用詞：直接說明數據查詢的結果，絕對不要說「經我們專業的直播串流品質診斷」這種自誇或過於技術感的贅字。說明簡單扼要、親切自然即可。
3. 如果判斷是主播端的問題，明確告知是在哪個時間點確認到網路或設備異常。
4. 排版與斷行限制：段落請保持緊湊，列點說明排障建議時（如 1. 2. 3. 等項目）「絕對不要空行斷行」，請保持連續緊湊的純文字區塊，避免版面出現奇怪的空白行。

【責任歸屬與補償邏輯】
1. 主播推流異常：判定為平台/主播端責任 -> 符合退鑽補償。
   *若上方【附加資訊】有提供門票金額，請在話術中自然地帶入「我們將為您退還本次扣除的 ${ticketPrice || 'X'} 鑽石」。
2. 主播推流正常、用戶拉流異常：判定為用戶本地網路或設備因素 -> 嚴格不予補償。
   *話術中「絕對不可提及任何退款、退鑽或金額」，僅提供網路檢查、關閉省電模式等排障建議。
3. 兩者皆正常或資訊不足：說明為瞬斷，請用戶提供具體時間點。

請務必以 JSON 格式回傳，格式如下：
{
  "faultSide": "streamer",
  "isEligibleForCompensation": true,
  "diagnosis": "這裡填寫技術診斷摘要",
  "replyScript": "這裡依照【客服話術撰寫規範】填寫給用戶的客服回覆"
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
