"""N5 Step A: 5개 foundation 항목 추가 + 기존 1~84를 6~89로 +5 shift.

사용:
  python3 _add_foundation_n5.py
"""
import json
import re
from pathlib import Path

DATA = Path(__file__).parent / "grammar-n5.json"

# ---------- 5개 foundation 항목 정의 ----------
# explanation 짧게 (사용자가 🔧 버튼으로 활용 가이드 호출),
# examples/quizzes 는 1~2개씩 (마크업: {kanji|reading} ruby, {{...}} 단일 target).

FOUNDATION_ITEMS = [
    {
        "no": 1,
        "pattern": "ます (ます형)",
        "romaji": "masu",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/%e3%81%be%e3%81%99-masu-meaning/",
        "refOriginalEn": "polite verb form (ます-form)",
        "meaningsKo": ["~합니다 (정중형, ます형)"],
        "category": "verb_form",
        "explanation": "동사를 정중하게 만드는 가장 기본 형태. 5단동사는 う단→い단+ます (会う→会います), 1단동사는 어간+ます (食べる→食べます), 불규칙 する→します, 来る→来ます. ます형 어간은 「~たい」, 「~ながら」, 「~ましょう」, 「~たがる」 등 수많은 파생 표현의 출발점.",
        "formation": "5단: う단→い단+ます / 1단: 어간+ます / する→します / 来る→来ます",
        "notes": "정중체의 기본형. 부정 ~ません, 과거 ~ました, 의문 ~ますか.",
        "applicableQuizTypes": ["conjugation", "form_meaning", "ko_to_jp_form"],
        "examples": [
            {
                "sentence": "{毎日|まいにち}{学校|がっこう}に{{行きます}}。",
                "sentenceTranslationKo": "매일 학교에 갑니다.",
                "note": None,
            },
            {
                "sentence": "{私|わたし}は{日本語|にほんご}を{{勉強します}}。",
                "sentenceTranslationKo": "저는 일본어를 공부합니다.",
                "note": None,
            },
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "食べる",
                    "group": "ichidan",
                    "targetFormLabel": "ます형 (정중형)",
                    "answer": "食べます",
                    "distractors": ["食べります", "食べるます", "食ます"],
                    "hintKo": "1단동사 = 어간 + ます",
                },
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "내일 도쿄에 갑니다.",
                    "answer": "{明日|あした}{東京|とうきょう}に{{行きます}}。",
                    "distractors": [
                        "{明日|あした}{東京|とうきょう}に{{行く}}。",
                        "{明日|あした}{東京|とうきょう}に{{行きません}}。",
                        "{明日|あした}{東京|とうきょう}に{{行った}}。",
                    ],
                    "hintKo": "정중체 현재형 = ます",
                },
            },
        ],
        "ruleFamily": "verb:masu",
        "isFoundation": True,
    },
    {
        "no": 2,
        "pattern": "て (て형)",
        "romaji": "te",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/%e3%81%a6-te-form-meaning/",
        "refOriginalEn": "te-form (connective verb form)",
        "meaningsKo": ["~하고, ~해서 (て형, 연결형)"],
        "category": "verb_form",
        "explanation": "동사를 연결하거나 의뢰·진행·허가 등 다양한 표현의 토대가 되는 형. 5단동사는 어미별 변화 (う・つ・る→って, ぬ・ぶ・む→んで, く→いて, ぐ→いで, す→して), 1단동사는 어간+て, する→して, 来る→来て. 「~ている」, 「~てもいい」, 「~てから」, 「~てしまう」 등 수많은 파생 표현의 출발점.",
        "formation": "5단: う/つ/る→って, ぬ/ぶ/む→んで, く→いて, ぐ→いで, す→して / 1단: 어간+て / する→して / 来る→来て / 行く→行って (예외)",
        "notes": "い형용사+くて, な형용사·명사+で 도 같은 연결 기능.",
        "applicableQuizTypes": ["conjugation", "form_meaning", "ko_to_jp_form"],
        "examples": [
            {
                "sentence": "{朝|あさ}{起|お}き{{て}}、{顔|かお}を{洗|あら}いました。",
                "sentenceTranslationKo": "아침에 일어나서 얼굴을 씻었습니다.",
                "note": None,
            },
            {
                "sentence": "{本|ほん}を{読|よ}ん{{で}}います。",
                "sentenceTranslationKo": "책을 읽고 있습니다.",
                "note": None,
            },
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "書く",
                    "group": "godan",
                    "targetFormLabel": "て형",
                    "answer": "書いて",
                    "distractors": ["書きて", "書って", "書くて"],
                    "hintKo": "5단 く → いて",
                },
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "공부하고 자요.",
                    "answer": "{勉強|べんきょう}し{{て}}{寝|ね}ます。",
                    "distractors": [
                        "{勉強|べんきょう}する{{て}}{寝|ね}ます。",
                        "{勉強|べんきょう}した{{て}}{寝|ね}ます。",
                        "{勉強|べんきょう}します{{て}}{寝|ね}ます。",
                    ],
                    "hintKo": "する의 て형 = して",
                },
            },
        ],
        "ruleFamily": "verb:te",
        "isFoundation": True,
    },
    {
        "no": 3,
        "pattern": "ない (ない형)",
        "romaji": "nai",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/%e3%81%aa%e3%81%84-nai-form-meaning/",
        "refOriginalEn": "nai-form (negative verb form)",
        "meaningsKo": ["~지 않다 (ない형, 부정형)"],
        "category": "verb_form",
        "explanation": "동사의 보통체 부정형. 5단동사는 う단→あ단+ない (会う→会わない), 1단동사는 어간+ない (食べる→食べない), 불규칙 する→しない, 来る→来ない, ある→ない (예외). 「~ないでください」, 「~なければならない」, 「~ないと」, 「~なくて」 등의 출발점.",
        "formation": "5단: う단→あ단+ない (예외 う→わ) / 1단: 어간+ない / する→しない / 来る→来ない / ある→ない",
        "notes": "ない형 어간 (~ない 의 ない 떼고 남는 부분) 이 다양한 파생의 토대. 정중형은 ~ません.",
        "applicableQuizTypes": ["conjugation", "form_meaning", "ko_to_jp_form"],
        "examples": [
            {
                "sentence": "{今日|きょう}は{学校|がっこう}に{{行かない}}。",
                "sentenceTranslationKo": "오늘은 학교에 가지 않는다.",
                "note": None,
            },
            {
                "sentence": "{朝|あさ}ご{飯|はん}を{{食べなかった}}。",
                "sentenceTranslationKo": "아침을 먹지 않았다.",
                "note": None,
            },
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "話す",
                    "group": "godan",
                    "targetFormLabel": "ない형 (부정형)",
                    "answer": "話さない",
                    "distractors": ["話しない", "話すない", "話さありません"],
                    "hintKo": "5단 す단 → さ단 + ない",
                },
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "비디오를 보지 않는다.",
                    "answer": "ビデオを{{見ない}}。",
                    "distractors": [
                        "ビデオを{{見ます}}。",
                        "ビデオを{{見て}}。",
                        "ビデオを{{見た}}。",
                    ],
                    "hintKo": "1단 = 어간 + ない",
                },
            },
        ],
        "ruleFamily": "verb:nai",
        "isFoundation": True,
    },
    {
        "no": 4,
        "pattern": "た (た형)",
        "romaji": "ta",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/%e3%81%9f-ta-form-meaning/",
        "refOriginalEn": "ta-form (past verb form)",
        "meaningsKo": ["~했다 (た형, 과거형·완료형)"],
        "category": "verb_form",
        "explanation": "동사의 보통체 과거·완료형. 음변화는 て형과 동일하고 마지막만 て→た 로 바뀜. 5단동사는 う・つ・る→った, ぬ・ぶ・む→んだ, く→いた, ぐ→いだ, す→した, 1단동사는 어간+た, する→した, 来る→来た, 行く→行った (예외). 「~たことがある」, 「~たばかり」, 「~たら」, 「~たほうがいい」 등의 출발점.",
        "formation": "5단: て형의 て→た / で→だ 변환 / 1단: 어간+た / する→した / 来る→来た",
        "notes": "정중형 ~ました 와 짝. た형 어간이 「~たり」, 「~たら」 등 다양한 파생의 토대.",
        "applicableQuizTypes": ["conjugation", "form_meaning", "ko_to_jp_form"],
        "examples": [
            {
                "sentence": "{昨日|きのう}{映画|えいが}を{{見た}}。",
                "sentenceTranslationKo": "어제 영화를 봤다.",
                "note": None,
            },
            {
                "sentence": "もう{宿題|しゅくだい}を{{した}}。",
                "sentenceTranslationKo": "이미 숙제를 했다.",
                "note": None,
            },
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "読む",
                    "group": "godan",
                    "targetFormLabel": "た형 (과거형)",
                    "answer": "読んだ",
                    "distractors": ["読みた", "読った", "読いた"],
                    "hintKo": "5단 む → んだ",
                },
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "어제 친구를 만났다.",
                    "answer": "{昨日|きのう}{友達|ともだち}に{{会った}}。",
                    "distractors": [
                        "{昨日|きのう}{友達|ともだち}に{{会う}}。",
                        "{昨日|きのう}{友達|ともだち}に{{会います}}。",
                        "{昨日|きのう}{友達|ともだち}に{{会わない}}。",
                    ],
                    "hintKo": "5단 う → った",
                },
            },
        ],
        "ruleFamily": "verb:ta",
        "isFoundation": True,
    },
    {
        "no": 5,
        "pattern": "辞書形 (사전형)",
        "romaji": "jishokei",
        "ref": "https://jlptsensei.com/learn-japanese-grammar/%e8%be%9e%e6%9b%b8%e5%bd%a2/",
        "refOriginalEn": "dictionary form (plain present)",
        "meaningsKo": ["사전형 (보통체 현재·미래)"],
        "category": "verb_form",
        "explanation": "사전에 실리는 동사의 기본 형태로, 보통체 현재·미래를 나타낸다. 5단동사는 う단으로 끝나며 (会う・書く・読む 등), 1단동사는 ~る (食べる・見る), 불규칙 する・来る. 「~ことができる」, 「~つもり」, 「~ところだ」, 「~べきだ」, 「~ように」 등 수많은 파생 표현의 출발점.",
        "formation": "5단동사: う단으로 끝남 / 1단동사: ~る / する / 来る",
        "notes": "보통체 현재형. 친한 사이·일기·소설 등에 사용.",
        "applicableQuizTypes": ["conjugation", "form_meaning", "ko_to_jp_form"],
        "examples": [
            {
                "sentence": "{毎日|まいにち}コーヒーを{{飲む}}。",
                "sentenceTranslationKo": "매일 커피를 마신다.",
                "note": None,
            },
            {
                "sentence": "{私|わたし}は{毎朝|まいあさ}{走|はし}る。",
                "sentenceTranslationKo": "나는 매일 아침 달린다.",
                "note": None,
            },
        ],
        "quizzes": [
            {
                "type": "conjugation",
                "payload": {
                    "dictForm": "食べます",
                    "group": "ichidan",
                    "targetFormLabel": "사전형",
                    "answer": "食べる",
                    "distractors": ["食べた", "食べて", "食べない"],
                    "hintKo": "ます형 어간 + る (1단)",
                },
            },
            {
                "type": "ko_to_jp_form",
                "payload": {
                    "ko": "주말에는 집에서 쉰다.",
                    "answer": "{週末|しゅうまつ}は{家|いえ}で{{休む}}。",
                    "distractors": [
                        "{週末|しゅうまつ}は{家|いえ}で{{休みます}}。",
                        "{週末|しゅうまつ}は{家|いえ}で{{休んだ}}。",
                        "{週末|しゅうまつ}は{家|いえ}で{{休まない}}。",
                    ],
                    "hintKo": "보통체 현재 = 사전형",
                },
            },
        ],
        "ruleFamily": "verb:dict",
        "isFoundation": True,
    },
]


def main():
    with DATA.open(encoding="utf-8") as f:
        d = json.load(f)

    # 1. 기존 모든 항목의 no 를 +5 shift
    for it in d["items"]:
        it["no"] = it["no"] + 5

    # 2. 새 5개 foundation 항목 앞에 prepend
    d["items"] = FOUNDATION_ITEMS + d["items"]

    # 3. 정렬 (안전을 위해)
    d["items"].sort(key=lambda x: x["no"])

    with DATA.open("w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"✅ N5 foundation 5개 추가, 기존 84개 +5 shift → 총 {len(d['items'])}개")
    print()
    print("first 10 (no, pattern, isFoundation):")
    for it in d["items"][:10]:
        fnd = "[F]" if it.get("isFoundation") else "   "
        rf = it.get("ruleFamily", "")
        print(f"  {fnd} no.{it['no']}: {it['pattern']:35s} {rf}")


if __name__ == "__main__":
    main()
