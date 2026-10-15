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
    const { streamerImage, userImage, ticketPrice, mode, singleImage } = req.body;

    function base64ToGenerativePart(base64Data) {
      const parts = base64Data.split(';');
      const mimeType = parts[0].split(':')[1];
      const data = parts[1].split(',')[1];
      return {
        inlineData: { data, mimeType }
      };
    }

    // 【模式一：貼上瞬間的單圖「秒速防呆」辨識】
    if (mode === 'quick_check' && singleImage) {
      const prompt = `這張截圖是直播推拉流數據。請看圖片左上角的標籤，告訴我它是「主播推流端」還是「用戶拉流端」？
      特徵提示：
      - 推流端：圖片文字包含 Sender's view, Video upstream pack 等
      - 拉流端：圖片文字包含 Audience, Receiver's view, Freeze time 等
      請務必只回傳 JSON 格式：{"type": "streamer"} 或 {"type": "user"}`;

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent([prompt, base64ToGenerativePart(singleImage)]);
      let cleanedText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      return res.status(200).json(JSON.parse(cleanedText));
    }

    // 【模式二：按下按鈕的「深度分析」】
    if (!streamerImage || !userImage) {
      return res.status(400).json({ error: '請提供主播與用戶的截圖' });
    }

    const ticketCondition = ticketPrice && ticketPrice.trim() !== '' 
      ? `用戶本次有輸入直播門票金額為：「${ticketPrice} 鑽」。` 
      : `用戶未提供直播門票金額。`;

    const prompt = `
你是一位具備多年音視頻直播技術與客服經驗的「直播串流品質診斷專家」。
我上傳了兩張圖片：第一張是「主播端推流」，第二張是「用戶端拉流」。

【全域語言與排版限制】(極度重要)
1. 語言強制：所有輸出內容必須 100% 使用「繁體中文 (zh-TW)」。
2. 排版強制：「技術診斷」與「客服回覆」都請保持最緊湊的排版，絕對不要產生「空白行」(禁止連續兩次換行)。
3. 若需提供排障建議，請直接合併成一個完整的段落，使用頓號或分號分隔即可，絕對禁止使用「1. 2. 3.」做條列式換行。

【附加資訊】
${ticketCondition}

【客服話術撰寫規範】
1. 開頭稱呼：一律使用「您好，」開頭。
2. 語氣與用詞：直接說明數據結果，簡單扼要。
3. 若判斷是主播端的問題，明確告知是在哪個時間點確認到異常。

【責任歸屬與補償邏輯】
1. 主播推流異常：判定為平台/主播端責任 -> 符合退鑽補償。
   *若有提供門票金額，請帶入「我們將為您退還本次扣除的 ${ticketPrice || 'X'} 鑽石」。
2. 主播推流正常、用戶拉流異常：判定為用戶本地因素 -> 嚴格不予補償。
   *話術中「絕對不可提及任何退款或金額」，僅提供排障建議。
3. 兩者皆正常或資訊不足：說明為瞬斷，請用戶提供具體時間點。

請務必以 JSON 格式回傳，格式如下：
{
  "faultSide": "streamer",
  "isEligibleForCompensation": true,
  "diagnosis": "請填寫繁體中文技術診斷摘要",
  "replyScript": "請填寫繁體中文客服回覆，不可有空白行，排障建議請寫成同一段"
}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([prompt, base64ToGenerativePart(streamerImage), base64ToGenerativePart(userImage)]);
    const responseText = result.response.text();

    let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    // 強制壓扁空白行
    if (parsedData.replyScript) parsedData.replyScript = parsedData.replyScript.replace(/\n\s*\n/g, '\n');
    if (parsedData.diagnosis) parsedData.diagnosis = parsedData.diagnosis.replace(/\n\s*\n/g, '\n');

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message || 'AI 分析失敗，請檢查 API Key 或稍後再試。' });
  }
}
