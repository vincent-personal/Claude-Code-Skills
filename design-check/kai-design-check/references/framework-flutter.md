# Flutter — 고유 함정과 계측

> Flutter 는 DOM 이 없다. 대신 **프레임워크가 레이아웃 오류를 스스로 알려 준다** — 그것이 가장 강한 신호다.

## 계측 방법 세 갈래

| 방법 | 잡는 것 | 한계 |
|---|---|---|
| **`integration_test` + `WidgetTester`** | 위젯 rect · 오버플로 · 터치 타깃 · 텍스트 잘림 · 접근성 라벨 | 시뮬레이터/기기 필요 |
| **`FlutterError.onError` 가로채기** | `RenderFlex overflowed by N pixels` — **프레임워크가 직접 알려주는 결함** | debug 빌드에서만 |
| **스크린샷 + `audit-pixel.mjs`** | 정렬 근접 불일치 · 여백 리듬 · **오버플로 줄무늬** · 가장자리 잘림 | 의미를 모른다 |

하네스: `assets/flutter/design_check_test.dart` · 실행기: `assets/flutter/run-flutter-check.sh`

> 🔑 **오버플로 줄무늬(노랑/검정 사선)는 스크린샷에서도 잡힌다.**
> release 빌드나 기기 캡처만 있어도 `audit-pixel.mjs` 가 `flutter-overflow` 로 보고한다.

---

## 고유 함정

### V1. `Row`/`Column` 안의 긴 텍스트가 넘침 (가장 흔하다)
**증상** 노랑/검정 줄무늬 + `A RenderFlex overflowed by 42 pixels on the right`
**원인** `Row` 의 자식이 무한 폭을 요구한다. `Text` 는 자기가 원하는 만큼 가져간다
**수정** `Expanded` 또는 `Flexible` 로 감싸고 `overflow: TextOverflow.ellipsis`
```dart
Row(children: [
  Expanded(child: Text(name, overflow: TextOverflow.ellipsis)),
  const SizedBox(width: 8),
  Text(price),          // 잘리면 안 되는 정보는 감싸지 않는다
])
```

### V2. `Column` 안의 `ListView`/`Column` 이 무한 높이를 요구
**수정** `Expanded` 로 감싸거나 `shrinkWrap: true` + `physics: NeverScrollableScrollPhysics()`

### V3. 시스템 글자 확대에서 깨짐 🔴
**증상** 접근성 설정으로 글자를 키우면 카드가 넘친다
**원인** 고정 `height` 를 준 컨테이너
**수정** 고정 높이 대신 `minHeight` (`ConstrainedBox`) · 텍스트에 `maxLines` + `ellipsis`
**검증** 하네스의 `TEXT_SCALES = [1.0, 1.3]`

### V4. `InkWell` 터치 타깃이 44px 미만
**원인** `InkWell` 은 **부모 크기를 따른다.** 아이콘만 감싸면 24px 가 된다
**수정** `IconButton`(기본 48px) 또는 `SizedBox(width:48,height:48)` · `padding` ·
`MaterialTapTargetSize.padded`

### V5. `SafeArea` 누락
**증상** 노치·홈 인디케이터에 내용이 물린다
**수정** `SafeArea(child: …)`. 하단 바는 `SafeArea(top:false)`.
`Scaffold` 의 `bottomNavigationBar` 는 자동 처리되지만 **커스텀 하단 바는 아니다**

### V6. 키보드가 올라오면 넘침
**증상** 입력 화면에서 키보드가 뜨면 `overflowed` 오류
**수정** `resizeToAvoidBottomInset: true`(기본) + 본문을 `SingleChildScrollView` 로.
`MediaQuery.of(context).viewInsets.bottom` 만큼 하단 여백

### V7. 접근성 라벨 없는 탭 대상
**수정** `Semantics(label: '…', button: true, child: …)` 또는 `IconButton(tooltip:)`
**검증** 하네스의 `a11y-unlabeled`

### V8. 하드코딩된 색
**수정** `ThemeData` / `ColorScheme` 로. 다크는 `ThemeData.dark()` 를 **실제로 확인**한다
**검증** `grep -rn "Color(0xFF" lib/`

### V9. 하드코딩된 간격
**수정** 간격 상수를 한 곳에 (`class Space { static const s8 = 8.0; … }`).
`Column` 은 `SizedBox` 대신 **`spacing:`**(Flutter 3.27+) 을 쓰면 리듬이 어긋나지 않는다

### V10. 시각 회귀가 없다
**수정** 골든 테스트:
```dart
testWidgets('주문 카드 골든', (t) async {
  await t.pumpWidget(wrap(const OrderCard(...)));
  await expectLater(find.byType(OrderCard), matchesGoldenFile('goldens/order_card.png'));
});
```
`flutter test --update-goldens` 로 기준 갱신. **CI 에서는 갱신하지 않는다.**

---

## Flutter Web 주의

- 기본 렌더러(CanvasKit)는 **캔버스에 그린다 — DOM 계측이 통하지 않는다.**
  `pixel` 어댑터를 쓴다
- `--web-renderer html` 로 빌드하면 DOM 이 생기지만 절대 위치라 웹 하네스의
  겹침·정렬 검사가 의미를 잃는다. **권장하지 않는다**
- 결론: **Flutter 는 웹이든 네이티브든 `flutter` + `pixel` 어댑터로 간다**
