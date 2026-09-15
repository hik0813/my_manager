/**
 * 관심사 카테고리 정의.
 * sources.json의 category 값이 여기 키와 맞아야 화면에서 제자리에 들어간다.
 * 순서가 곧 화면 순서다 — 위에 있을수록 자주 본다고 가정한 것.
 */
export type CategoryKey =
  | "news"
  | "security"
  | "game-news"
  | "game-deal"
  | "game-mine"
  | "gamedev"
  | "dev-mine"
  | "hardware"
  | "music"
  | "learn"
  | "link"
  | "etc";

export type CategoryMeta = {
  key: CategoryKey;
  label: string;
  /** 접힌 줄에 함께 보이는 한 줄 설명 */
  hint: string;
  /** 묶음 — 화면에서 큰 단위로 나눈다 */
  group: "소식" | "게임" | "나" | "배움";
};

export const CATEGORIES: CategoryMeta[] = [
  { key: "news", label: "뉴스", hint: "IT · AI · 해커뉴스", group: "소식" },
  { key: "security", label: "보안", hint: "보안 뉴스와 내 라이브러리 취약점", group: "소식" },
  { key: "game-news", label: "게임 소식", hint: "새 게임, 업데이트, 게임 뉴스", group: "게임" },
  { key: "game-deal", label: "할인 · 가격", hint: "인기 게임과 찜한 게임 최저가", group: "게임" },
  { key: "game-mine", label: "내 게임", hint: "찜한 게임 동향과 롤 전적", group: "게임" },
  { key: "gamedev", label: "게임 개발", hint: "만드는 쪽 이야기", group: "배움" },
  { key: "dev-mine", label: "내 개발", hint: "GitHub 활동과 쓰는 도구의 새 버전", group: "나" },
  { key: "hardware", label: "부품 가격", hint: "찜한 부품 최저가", group: "나" },
  { key: "music", label: "음악", hint: "JPOP 차트와 인기 영상", group: "배움" },
  { key: "learn", label: "학습 · 추천", hint: "오늘의 꿀팁, 배울 기술, 게임 추천", group: "배움" },
  { key: "link", label: "바로가기", hint: "자동 수집이 안 되는 곳", group: "게임" },
  { key: "etc", label: "기타", hint: "분류되지 않은 것", group: "소식" },
];

export const GROUP_ORDER = ["소식", "게임", "나", "배움"] as const;

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryMeta(key: string): CategoryMeta {
  return BY_KEY.get(key as CategoryKey) ?? BY_KEY.get("etc")!;
}
