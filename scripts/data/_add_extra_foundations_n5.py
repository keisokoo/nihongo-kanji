"""N5 에 활용 자체 항목 3개 추가 (no.90, 91, 92):
  - 〜ば (조건형, verb:ba)
  - 가능형 (verb:potential)
  - 명령형 (verb:imperative)

기존 N5 1~89 의 no 는 변경하지 않고 끝에 추가.
"""
import json
from pathlib import Path

NEW_ITEMS = [
    {
        "no": 90,
        "pattern": "ば (조건형)",
        "romaji": "ba",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/%e3%81%b0-ba-conditional/",
        "refOriginalEn": "ba conditional form",
        "meaningsKo": [
            "~하면 (조건·가정)"
        ],
        "category": "verb_form",
        "explanation": (
            "동사·형용사의 조건형. 「~하면」 의 의미로, 일반적 조건·가정·속담·관용 표현에 자주 쓰인다. "
            "たら / と / なら 와 함께 일본어 4대 조건 표현 중 하나이며, 가장 격식적·논리적인 조건이다.\n\n"
            "【형성 규칙】\n"
            "• 1그룹 (5단): 어미 う단 → え단 + ば — 行く → 行けば, 飲む → 飲めば, 会う → 会えば\n"
            "• 2그룹 (1단): 어미 る를 빼고 れば — 食べる → 食べれば, 見る → 見れば\n"
            "• 3그룹: する → すれば, 来る → 来(く)れば\n"
            "• い형용사: 어미 い → ければ — 安い → 安ければ, よい → よければ\n"
            "• な형용사·명사 + であれば / なら — 静かであれば, 学生であれば (구어는 보통 なら)\n"
            "• 부정형: ない → なければ (행く → 行かなければ)\n\n"
            "【의미·용법】\n"
            "• 일반 조건 — 春になれば、桜が咲く (봄이 되면 벚꽃이 핀다)\n"
            "• 가정 — お金があれば、買います (돈이 있으면 살게요)\n"
            "• 속담·관용 — 終わりよければすべてよし (끝이 좋으면 다 좋다)\n"
            "• 「~ば~ほど」 — 構造 〜ば〜ほど (~할수록)\n\n"
            "【제약】\n"
            "• 후속 절에 명령·권유·의지·요청 표현은 잘 쓰이지 않음 (이 경우 たら / なら 사용)\n"
            "  - 春になれば、花見に行こう (X — 어색)\n"
            "  - 春になったら、花見に行こう (○)\n\n"
            "【파생 표현】\n"
            "• 〜ば〜ほど (~할수록)\n"
            "• 〜ばいい (~하면 된다 / 좋겠다), 〜ばよかった (~했으면 좋았을 텐데)\n"
            "• 〜なければならない / 〜なければいけない (~해야 한다)\n"
            "• 〜ばこそ (~이기 때문에 — N1 격식)"
        ),
        "formation": "5단: う단→え단+ば / 1단: 어간+れば / する→すれば / 来る→来れば / い형용사: い→ければ",
        "notes": "일반 조건. 후속 절에 명령·권유 표현은 たら / なら 사용.",
        "applicableQuizTypes": [
            "conjugation",
            "form_meaning",
            "ko_to_jp_form"
        ],
        "examples": [
            {
                "sentence": "{時間|じかん}が{{あれば}}、{映画|えいが}を{見|み}ます。",
                "sentenceTranslationKo": "시간이 있으면 영화를 봅니다.",
                "note": None
            },
            {
                "sentence": "{安|やす}{{ければ}}、{買|か}います。",
                "sentenceTranslationKo": "싸면 살게요.",
                "note": None
            }
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "食べる",
                    "group": "ichidan",
                    "targetFormLabel": "ば형 (조건형)",
                    "answer": "食べれば",
                    "distractors": [
                        "食べば",
                        "食べるば",
                        "食べらば"
                    ],
                    "hintKo": "1단동사 = 어간 + れば"
                }
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "비가 오면 가지 않습니다.",
                    "answer": "{雨|あめ}が{{降れば}}、{行|い}きません。",
                    "distractors": [
                        "{雨|あめ}が{{降ったら}}、{行|い}きません。",
                        "{雨|あめ}が{{降ると}}、{行|い}きません。",
                        "{雨|あめ}が{{降って}}、{行|い}きません。"
                    ],
                    "hintKo": "ば형 = う단→え단+ば"
                }
            }
        ],
        "ruleFamily": "verb:ba",
        "isFoundation": True
    },
    {
        "no": 91,
        "pattern": "可能形 (가능형)",
        "romaji": "kanoukei",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/potential-form/",
        "refOriginalEn": "potential form",
        "meaningsKo": [
            "~할 수 있다 (가능)"
        ],
        "category": "verb_form",
        "explanation": (
            "동사를 「~할 수 있다」 의미로 만드는 활용. 능력·가능성·허가·상황적 가능을 표현한다. "
            "수동형과 형태가 같은 부분이 있어 헷갈리기 쉬우니 활용 그룹별로 정확히 익혀야 한다.\n\n"
            "【형성 규칙】\n"
            "• 1그룹 (5단): 어미 う단 → え단 + る — 書く → 書ける, 飲む → 飲める, 行く → 行ける\n"
            "• 2그룹 (1단): 어미 る를 빼고 られる — 食べる → 食べられる, 見る → 見られる\n"
            "  (회화에서 「ら抜き」 — ら 빼고 食べれる / 見れる 가 흔함, 격식체에서는 られる 사용)\n"
            "• 3그룹: する → できる (특수), 来る → 来(こ)られる\n\n"
            "【주의】\n"
            "• 1단 가능형은 수동형과 형태 동일 (食べられる) — 문맥으로 구분\n"
            "• ある (있다) 는 가능형 X (가능 의미는 「ありうる」 등 별도 표현)\n"
            "• わかる, できる, 見える, 聞こえる 등은 자체로 가능 의미 → 가능형 X\n\n"
            "【조사 변화】\n"
            "• 가능형 동사의 목적어는 「を」 대신 「が」 가 자주 쓰임\n"
            "  - パン{{を}}食べる → パン{{が}}食べられる (빵을 먹을 수 있다)\n"
            "• を 도 사용 가능, が 가 좀더 자연스러운 경향\n\n"
            "【의미 분류】\n"
            "• 능력 — 私は日本語が{{話せる}} (일본어를 할 수 있다)\n"
            "• 상황적 가능 — ここでタバコが{{吸える}} (여기서 담배를 피울 수 있다 — 허가)\n"
            "• 가능성 — そのレストランは予約が{{できる}}\n\n"
            "【파생 표현】\n"
            "• 〜られるようになる (~할 수 있게 되다)\n"
            "• 〜ことができる (사전형 + ことができる, 격식적 가능 표현)"
        ),
        "formation": "5단: う단→え단+る / 1단: 어간+られる / する→できる / 来る→来られる",
        "notes": "1단 가능형은 수동형과 형태 동일. 회화에서 ら抜き (食べれる) 흔함.",
        "applicableQuizTypes": [
            "conjugation",
            "form_meaning",
            "ko_to_jp_form"
        ],
        "examples": [
            {
                "sentence": "{私|わたし}は{日本語|にほんご}が{少|すこ}し{{話せます}}。",
                "sentenceTranslationKo": "저는 일본어를 조금 할 수 있습니다.",
                "note": None
            },
            {
                "sentence": "ここで{写真|しゃしん}が{{撮れます}}か。",
                "sentenceTranslationKo": "여기서 사진을 찍을 수 있나요?",
                "note": None
            }
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "書く",
                    "group": "godan",
                    "targetFormLabel": "가능형",
                    "answer": "書ける",
                    "distractors": [
                        "書かれる",
                        "書きれる",
                        "書こえる"
                    ],
                    "hintKo": "5단 가능형 = う단→え단+る"
                }
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "한자를 읽을 수 있습니다.",
                    "answer": "{漢字|かんじ}が{{読めます}}。",
                    "distractors": [
                        "{漢字|かんじ}を{{読みます}}。",
                        "{漢字|かんじ}が{{読まれます}}。",
                        "{漢字|かんじ}が{{読んでいます}}。"
                    ],
                    "hintKo": "가능형 + ます"
                }
            }
        ],
        "ruleFamily": "verb:potential",
        "isFoundation": True
    },
    {
        "no": 92,
        "pattern": "命令形 (명령형)",
        "romaji": "meireikei",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/imperative-form/",
        "refOriginalEn": "imperative form",
        "meaningsKo": [
            "~해라 / ~하지 마라 (명령·금지)"
        ],
        "category": "verb_form",
        "explanation": (
            "동사로 강한 명령·금지를 직접 표현하는 활용. 회화에서는 거칠게 들리므로 가족·친구·운동 지도·표지판·인용 등 "
            "특수 상황에서 주로 사용. 부드러운 명령은 〜なさい / 〜てください 등을 사용한다.\n\n"
            "【형성 규칙】 — 긍정 명령 (~해라)\n"
            "• 1그룹 (5단): 어미 う단 → え단 — 行く → 行け, 飲む → 飲め, 待つ → 待て\n"
            "• 2그룹 (1단): 어미 る → ろ (또는 よ, 문어) — 食べる → 食べろ, 見る → 見ろ\n"
            "• 3그룹: する → しろ (せよ, 문어), 来る → 来(こ)い\n\n"
            "【형성 규칙】 — 금지 명령 (~하지 마라)\n"
            "• 사전형 + な — 行くな, 食べるな, 見るな, するな, 来るな\n"
            "  (※ 같은 「な」 라도 ます형 + な = 〜なさい 의 축약 — 정중한 명령. 문맥 주의)\n\n"
            "【다른 명령 표현】\n"
            "• 〜なさい — 부드러운 명령 (어른 → 아이, 선생 → 학생): 食べなさい\n"
            "• 〜てください — 정중 요청: 食べてください\n"
            "• 〜たまえ — 옛 남자말 명령 (격식·소설): 食べたまえ\n\n"
            "【사용 상황】\n"
            "• 표지판·구호 — 「止まれ」 (멈추시오), 「火の用心」 부류\n"
            "• 응원·격려 — 「頑張れ！」 (힘내라!)\n"
            "• 인용 — 父は「早く{{帰れ}}」と言った (아버지가 「빨리 돌아오라」 고 말했다)\n"
            "• 금지 표지 — 「ここに駐車するな」 (여기에 주차하지 마라)\n\n"
            "【주의】\n"
            "• 일상 회화에서 윗사람·낯선 사람에게 사용하면 매우 무례함\n"
            "• 여성은 거의 사용하지 않음 (대신 〜て / 〜なさい)"
        ),
        "formation": "긍정: 5단 う단→え단 / 1단 어간+ろ / する→しろ / 来る→来い // 금지: 사전형 + な",
        "notes": "강한 명령·금지. 회화에서는 거칠어 표지판·인용·응원 외 잘 안 쓰임.",
        "applicableQuizTypes": [
            "conjugation",
            "form_meaning",
            "ko_to_jp_form"
        ],
        "examples": [
            {
                "sentence": "{早|はや}く{{帰れ}}！",
                "sentenceTranslationKo": "빨리 돌아와라!",
                "note": "강한 명령. 부모·코치 등 윗사람이 사용하는 말투."
            },
            {
                "sentence": "ここで{{タバコを吸うな}}。",
                "sentenceTranslationKo": "여기서 담배를 피우지 마라.",
                "note": "사전형 + な = 금지 명령."
            }
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "食べる",
                    "group": "ichidan",
                    "targetFormLabel": "명령형 (긍정)",
                    "answer": "食べろ",
                    "distractors": [
                        "食べれ",
                        "食べる",
                        "食べな"
                    ],
                    "hintKo": "1단동사 = 어간 + ろ"
                }
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "여기서 담배를 피우지 마라.",
                    "answer": "ここで{{タバコを吸うな}}。",
                    "distractors": [
                        "ここで{{タバコを吸って}}。",
                        "ここで{{タバコを吸いません}}。",
                        "ここで{{タバコを吸えない}}。"
                    ],
                    "hintKo": "금지 명령 = 사전형 + な"
                }
            }
        ],
        "ruleFamily": "verb:imperative",
        "isFoundation": True
    }
]


def main():
    seed_path = Path(__file__).parent / "grammar-n5.json"
    with seed_path.open(encoding="utf-8") as f:
        d = json.load(f)

    existing_nos = {it["no"] for it in d["items"]}
    for item in NEW_ITEMS:
        if item["no"] in existing_nos:
            print(f"❌ no.{item['no']} already exists, skipping.")
            return

    d["items"].extend(NEW_ITEMS)

    with seed_path.open("w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"✅ Added {len(NEW_ITEMS)} new foundations to N5: nos {[it['no'] for it in NEW_ITEMS]}")
    print(f"   → verb:ba, verb:potential, verb:imperative now have foundations")
    print(f"   N5 total items: {len(d['items'])}")


if __name__ == "__main__":
    main()
