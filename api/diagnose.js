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

    // 單圖快速防呆
    if (mode === 'quick_check' && singleImage) {
      const prompt = `這張截圖是直播推拉流數據。請看圖片文字與標籤，告訴我它是「主播推流端」還是「用戶拉流端」？
      特徵提示：
      - 推流端：圖片文字包含 Sender's view, Video upstream pack 等
      - 拉流端：圖片文字包含 Audience, Receiver's view, Freeze time 等
      請務必只回傳 JSON 格式：{"type": "streamer"} 或 {"type": "user"}`;

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent([prompt, base64ToGenerativePart(singleImage)]);
      let cleanedText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      return res.status(200).json(JSON.parse(cleanedText));
    }

    if (!streamerImage || !userImage) {
      return res.status(400).json({ error: '請提供主播與用戶的截圖' });
    }

    const ticketCondition = ticketPrice && ticketPrice.trim() !== '' 
      ? `用戶本次有輸入直播門票金額為：「${ticketPrice} 鑽」。` 
      : `用戶未提供直播門票金額。`;

    const prompt = `
你是一位具備多年音視頻直播技術與客服經驗的「直播串流品質診斷專家」。
我上傳了兩張圖片：第一張是「主播端推流」，第二張是「用戶端拉流」。

【全域語言與排版限制】
1. 語言強制：所有輸出內容必須 100% 使用「繁體中文 (zh-TW)」。
2. 排版強制：「技術診斷」與「客服回覆」都請保持最緊湊的排版，絕對不要產生「空白行」(禁止連續兩次換行)。
3. 若需提供排障建議，請直接合併成一個完整的段落，使用頓號或分號分隔，禁止使用「1. 2. 3.」條列式換行。

【附加資訊】
${ticketCondition}

【指標正常 vs 異常的嚴格判斷準則】(極重要，請勿過度診斷)
1. 碼率（Bitrate）：視訊動態編碼（VBR）在 1500~2500 kbps 之間的波浪起伏屬於「完全正常的物理動態現象」，非異常。只有發生「斷崖式驟降（跌破 500 kbps 甚至歸零）」才算異常。
2. 推流丟包（Packet Loss）：推流端紅色柱狀丟包率為 0 或小於 2% 時，代表推流端網路極佳，絕對正常。
3. 拉流凍結（Freeze time）：拉流端若無柱狀飆高（維持在 0 或底線），代表用戶觀看沒有系統性卡頓。
4. 【雙端正常判定】：若主播端丟包率為 0，且用戶端無明顯凍結時間（Freeze time），即便碼率有正常微幅波動，也必須判定為「雙端正常（faultSide: "normal"）」，此時「嚴禁退鑽」。

【責任歸屬與補償邏輯】
1. faultSide = "streamer"（主播責任）：主播端丟包率 > 2-3% 或碼率斷崖式崩跌。符合退鑽（isEligibleForCompensation = true）。話術說明在具體時間點有推流異常，並退還 ${ticketPrice || 'X'} 鑽石。
2. faultSide = "user"（用戶責任）：主播推流極度穩定正常，但用戶端 Freeze time 飆高或用戶端丟包嚴重。不予退鑽（isEligibleForCompensation = false），提供排障建議。
3. faultSide = "normal"（雙端皆正常）：雙端數據良好無丟包無凍結。不予退鑽（isEligibleForCompensation = false）。客服話術告知目前查閱數據，推流與拉流品質皆十分穩定，請用戶提供更精確的卡頓時間點以利複查。

請務必以 JSON 格式回傳：
{
  "faultSide": "streamer" | "user" | "normal",
  "isEligibleForCompensation": true 或 false,
  "diagnosis": "請填寫繁體中文技術診斷摘要",
  "replyScript": "請填寫繁體中文客服回覆"
}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([prompt, base64ToGenerativePart(streamerImage), base64ToGenerativePart(userImage)]);
    const responseText = result.response.text();

    let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    if (parsedData.replyScript) parsedData.replyScript = parsedData.replyScript.replace(/\n\s*\n/g, '\n');
    if (parsedData.diagnosis) parsedData.diagnosis = parsedData.diagnosis.replace(/\n\s*\n/g, '\n');

    res.status(200).json(parsedData);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message || 'AI 分析失敗，請檢查 API Key 或稍後再試。' });
  }
}
