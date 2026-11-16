// 관리자 화면 공용: 이미지를 올리기 전에 브라우저에서 줄이기 (브라우저 전용)

/** 올리기 전에 브라우저에서 줄인다: 긴 변 1600px, 3MB 아래 (서버 한도 4MB · Vercel 요청 한도 4.5MB)
 *  maxSide: 긴 변 최대 픽셀 (글자 읽기 도구는 작은 글씨가 뭉개지지 않게 더 크게)
 *  - 화면 캡처(PNG)는 용량이 커서 JPG 로 바꾼다. 움직이는 GIF 와 작은 이미지는 그대로. */
const TARGET = 3_000_000;
export async function shrink(file: File, maxSide = 1600): Promise<File> {
  if (file.type === "image/gif" && file.size <= TARGET) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const small = Math.max(bitmap.width, bitmap.height) <= maxSide;
  if (small && file.size <= 1_000_000) return file;
  for (const [side, q] of [[maxSide, 0.88], [maxSide, 0.75], [maxSide * 0.8, 0.72], [maxSide * 0.64, 0.68]]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#ffffff"; // 투명한 부분은 흰 바탕으로
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= TARGET) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return file;
}
