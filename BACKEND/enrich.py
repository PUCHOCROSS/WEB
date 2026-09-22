"""링크의 대표 이미지 / 제목 자동 추출 (tkinter 비의존)

'발행 전 편집' 창에서 각 항목의 썸네일(og:image)을 자동으로 채우는 데 사용합니다.
PreviewPanel(result_table.py)의 본문 미리보기와 같은 방식으로 requests + beautifulsoup4 를
사용하며, 둘 중 하나라도 설치되어 있지 않으면 빈 값을 돌려줍니다 (자동 채우기만 비활성화되고
수동 입력은 항상 가능합니다).
"""
import urllib.parse

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


def fetch_og(url, timeout=6):
    """{'title': str, 'image': str} 반환. 실패하거나 값이 없으면 빈 문자열."""
    out = {"title": "", "image": ""}
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        return out

    try:
        resp = requests.get(url, timeout=timeout, headers=_HEADERS)
        if resp.status_code != 200:
            return out
        if not resp.encoding or resp.encoding.lower() == "iso-8859-1":
            resp.encoding = resp.apparent_encoding
        soup = BeautifulSoup(resp.text, "html.parser")

        def meta(*names):
            for n in names:
                tag = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
                if tag and tag.get("content"):
                    return tag["content"].strip()
            return ""

        image = meta("og:image", "og:image:url", "twitter:image", "twitter:image:src")
        if image:
            image = urllib.parse.urljoin(url, image)  # 상대경로 이미지 주소 보정
        title = meta("og:title", "twitter:title")
        if not title and soup.title and soup.title.string:
            title = soup.title.string.strip()

        out["title"], out["image"] = title, image
    except Exception:
        pass
    return out
