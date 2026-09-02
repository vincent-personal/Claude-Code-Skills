// kai-design-check — Flutter 계측 하네스
//
// DOM 이 없으므로 위젯 트리를 직접 잰다. `integration_test` 로 실기기/시뮬레이터에서 돌린다.
//
//   1) pubspec.yaml 의 dev_dependencies 에 추가:
//        integration_test: { sdk: flutter }
//        flutter_test:     { sdk: flutter }
//   2) 이 파일을 integration_test/design_check_test.dart 로 둔다
//   3) ROUTES 와 앱 부트스트랩(2곳)을 프로젝트에 맞게 고친다
//   4) flutter test integration_test/design_check_test.dart -d <기기>
//
// 잡는 것:
//   ① RenderFlex/RenderBox 오버플로 — Flutter 가 스스로 내는 오류를 가로챈다 (가장 확실)
//   ② 화면 밖으로 나간 위젯
//   ③ 44px 미만 터치 타깃
//   ④ 접근성 라벨 없는 탭 대상
//   ⑤ 텍스트 잘림(ellipsis 없이 넘침)
//   ⑥ 여러 화면 크기 × 텍스트 배율
//   ⑦ 스크린샷 저장 → audit-pixel.mjs 로 정렬·간격 검사

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

// ⬇⬇ 프로젝트에 맞게 고칠 곳 1 — 앱 진입점
// import 'package:내앱/main.dart' as app;

/// 검사할 화면. 라우트 이름 또는 진입 위젯.
const ROUTES = <String>[
  '/',
  // '/orders',
  // '/settings',
];

/// 검사할 화면 크기 — **가장 좁은 기기(320)를 반드시 넣는다**
const SIZES = <Size>[
  Size(320, 568),   // iPhone SE 1세대 — 결함이 가장 많이 나온다
  Size(390, 844),   // iPhone 14
  Size(768, 1024),  // 태블릿 세로
  Size(1024, 768),  // 태블릿 가로 / 데스크탑
];

/// 시스템 글자 크게 설정 — 레이아웃이 버티는지 본다
const TEXT_SCALES = <double>[1.0, 1.3];

final issues = <String>[];
void report(String kind, String detail) => issues.add('[$kind] $detail');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // ── ① Flutter 가 내는 레이아웃 오류를 전부 모은다.
  //    "A RenderFlex overflowed by 42 pixels on the right" 같은 것 —
  //    프레임워크가 직접 알려주는 결함이라 가장 신뢰도가 높다.
  final captured = <String>[];
  final prevOnError = FlutterError.onError;
  FlutterError.onError = (FlutterErrorDetails d) {
    final s = d.exceptionAsString();
    if (s.contains('overflowed') ||
        s.contains('RenderFlex') ||
        s.contains('constraints') ||
        s.contains('Incorrect use of ParentData')) {
      captured.add(s.split('\n').first);
    }
    prevOnError?.call(d);
  };

  for (final size in SIZES) {
    for (final scale in TEXT_SCALES) {
      testWidgets('${size.width.toInt()}x${size.height.toInt()} · 글자배율 $scale',
          (WidgetTester tester) async {
        await tester.binding.setSurfaceSize(size);
        tester.view.physicalSize = size * tester.view.devicePixelRatio;
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        for (final route in ROUTES) {
          captured.clear();
          final tag = '$route @${size.width.toInt()}·x$scale';

          // ⬇⬇ 프로젝트에 맞게 고칠 곳 2 — 화면 띄우기
          // app.main();
          // await tester.pumpAndSettle();
          // if (route != '/') {
          //   Navigator.of(tester.element(find.byType(Navigator))).pushNamed(route);
          //   await tester.pumpAndSettle();
          // }
          await tester.pumpWidget(
            MediaQuery(
              data: MediaQueryData(size: size, textScaler: TextScaler.linear(scale)),
              // child: app.MyApp(initialRoute: route),
              child: const Placeholder(),
            ),
          );
          await tester.pumpAndSettle(const Duration(seconds: 1));

          // ① 프레임워크가 잡아 준 오버플로
          for (final c in captured) report('flutter-overflow', '$tag — $c');

          // ② 화면 밖으로 나간 위젯
          final screen = Rect.fromLTWH(0, 0, size.width, size.height);
          void walk(RenderObject ro, [String path = '']) {
            if (ro is RenderBox && ro.hasSize) {
              try {
                final off = ro.localToGlobal(Offset.zero);
                final r = off & ro.size;
                if (r.width > 1 && r.height > 1) {
                  if (r.right > screen.right + 1.5) {
                    report('overflow-x', '$tag — ${ro.runtimeType} 오른쪽 ${(r.right - screen.right).toStringAsFixed(0)}px 초과');
                  }
                  if (r.left < -1.5) {
                    report('overflow-x', '$tag — ${ro.runtimeType} 왼쪽 ${(-r.left).toStringAsFixed(0)}px 초과');
                  }
                }
              } catch (_) {/* 아직 배치 안 된 것 */}
            }
            ro.visitChildren((c) => walk(c, path));
          }
          final root = tester.binding.renderViewElement?.renderObject;
          if (root != null) walk(root);

          // ③ 터치 타깃 44px
          for (final type in <Type>[InkWell, GestureDetector, IconButton, TextButton, Checkbox, Radio, Switch]) {
            for (final el in find.byType(type).evaluate()) {
              final ro = el.renderObject;
              if (ro is! RenderBox || !ro.hasSize) continue;
              final s = ro.size;
              if (s.width < 1 || s.height < 1) continue;
              if (s.width < 44 || s.height < 44) {
                report('tap-small',
                    '$tag — $type ${s.width.toStringAsFixed(0)}×${s.height.toStringAsFixed(0)} (44 미만). '
                    'InkWell 은 부모 크기를 따르니 padding 이나 SizedBox 로 넓힐 것');
              }
            }
          }

          // ④ 접근성 라벨 없는 탭 대상
          final semantics = tester.binding.pipelineOwner.semanticsOwner;
          if (semantics != null) {
            void checkSem(SemanticsNode n) {
              final d = n.getSemanticsData();
              final tappable = d.hasAction(SemanticsAction.tap);
              final labelled = d.label.trim().isNotEmpty || d.tooltip.trim().isNotEmpty;
              if (tappable && !labelled && d.rect.width > 4 && d.rect.height > 4) {
                report('a11y-unlabeled',
                    '$tag — 누를 수 있는데 이름이 없다 (${d.rect.width.toStringAsFixed(0)}×${d.rect.height.toStringAsFixed(0)}). '
                    'Semantics(label:) 또는 tooltip 을 줄 것');
              }
              n.visitChildren((c) { checkSem(c); return true; });
            }
            final rootSem = semantics.rootSemanticsNode;
            if (rootSem != null) checkSem(rootSem);
          }

          // ⑤ 텍스트 잘림 — 넘치는데 ellipsis 가 없다
          for (final el in find.byType(Text).evaluate()) {
            final w = el.widget as Text;
            final ro = el.renderObject;
            if (ro is! RenderParagraph || !ro.hasSize) continue;
            if (ro.didExceedMaxLines && w.overflow != TextOverflow.ellipsis) {
              report('text-clip', '$tag — "${(w.data ?? '').substring(0, (w.data ?? '').length.clamp(0, 20))}" 넘치는데 ellipsis 가 없다');
            }
          }

          // ⑦ 스크린샷 — audit-pixel.mjs 로 정렬·간격을 마저 본다
          try {
            final dir = Directory('.ui-audit/shots')..createSync(recursive: true);
            final name = '${route.replaceAll('/', '_')}_${size.width.toInt()}_x$scale.png';
            await tester.binding.takeScreenshot('${dir.path}/$name');
          } catch (_) {/* 기기에 따라 지원 안 될 수 있다 */}
        }
      });
    }
  }

  tearDownAll(() {
    final f = File('.ui-audit/flutter.txt')..createSync(recursive: true);
    final head = '\n═══ Flutter 디자인 감사 ═══\n총 ${issues.length}건\n';
    f.writeAsStringSync(head + issues.join('\n'));
    // ignore: avoid_print
    print(head + issues.join('\n'));
    if (issues.isNotEmpty) {
      // ignore: avoid_print
      print('\n✗ 결함 ${issues.length}건 — .ui-audit/flutter.txt 참조');
    }
  });
}
