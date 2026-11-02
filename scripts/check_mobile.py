#!/usr/bin/env python3
"""Static mobile checks that do NOT require the Flutter SDK.

Used by CI (`.github/workflows/mobile.yml`) and locally before `flutter analyze`:

1. Parse every `mobile/lib|test|integration_test/*.dart` with the tree-sitter
   Dart grammar → zero syntax errors.
2. Every relative import resolves; every local import is actually used (at
   least one top-level symbol from it is referenced).
3. Every `package:` import is declared in `pubspec.yaml`.
4. Every `s('key')` i18n key exists in the bilingual dictionary (and has both
   Arabic and English values).
5. Every `context.go('/route')` deep-link route exists in `main.dart`.
6. Every API path used by the client exists in `docs/openapi.json`.

This complements (never replaces) `flutter analyze` / `flutter test` on CI.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import tree_sitter_dart
    from tree_sitter import Language, Parser
except ImportError:
    print("pip install tree-sitter tree_sitter_dart", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parent.parent
MOBILE = ROOT / "mobile"
PARSER = Parser(Language(tree_sitter_dart.language()))

DECL_TYPES = {
    "class_definition",
    "enum_definition",
    "extension_declaration",
    "mixin_declaration",
    "function_signature",
    "top_level_function",
    "typedef",
    "constant_declaration",
    "initialized_variable_declaration",
}


def parse(path: Path):
    data = path.read_bytes()
    return PARSER.parse(data), data


def errors(node, out: list):
    if node.type == "ERROR" or node.is_missing:
        out.append((node.type, node.start_point, node.is_missing))
    for child in node.children:
        errors(child, out)


def declared_names(tree) -> set[str]:
    """Top-level public names declared by a Dart file."""
    out: set[str] = set()
    for child in tree.root_node.children:
        if child.type in {"import_or_export", "comment", "documentation_comment", ";"}:
            continue
        if child.type in DECL_TYPES or child.type.endswith("declaration") or child.type.endswith("definition") or child.type in {"function_signature", "static_final_declaration_list", "final_declaration_list"}:
            for sub in child.children:
                if sub.type in {"identifier", "type_identifier"} and sub.text:
                    name = sub.text.decode("utf-8", "replace")
                    if not name.startswith("_"):
                        out.add(name)
        # Top-level function bodies/signatures are separate root children.
        if child.type == "function_signature":
            for sub in child.children:
                if sub.type == "identifier":
                    out.add(sub.text.decode("utf-8", "replace"))
    # Regex fallback for declarations the grammar splits across nodes.
    return out


def identifiers(tree) -> set[str]:
    out: set[str] = set()

    def walk(node):
        if node.type in {"identifier", "type_identifier"} and node.text:
            out.add(node.text.decode("utf-8", "replace"))
        for c in node.children:
            walk(c)

    walk(tree.root_node)
    return out


def main() -> int:
    dart_files = sorted(
        list((MOBILE / "lib").rglob("*.dart"))
        + list((MOBILE / "test").rglob("*.dart"))
        + list((MOBILE / "integration_test").rglob("*.dart"))
    )
    problems: list[str] = []
    trees: dict[Path, tuple] = {}
    for f in dart_files:
        tree, data = parse(f)
        trees[f] = (tree, data)
        errs: list = []
        errors(tree.root_node, errs)
        if errs:
            problems.append(f"SYNTAX {f.relative_to(ROOT)}: {errs[:3]}")

    pubspec = (MOBILE / "pubspec.yaml").read_text(encoding="utf-8")
    dep_block = pubspec.split("dev_dependencies:", 1)[0]
    deps = set(re.findall(r"^\s{2}([a-z0-9_]+):", dep_block, re.M))

    for f, (tree, data) in trees.items():
        text = data.decode("utf-8", "replace")
        ids = identifiers(tree)
        for uri in re.findall(r"^import\s+'([^']+)';", text, re.M):
            if uri.startswith("package:"):
                pkg = uri.split("/", 1)[0].split(":", 1)[1]
                if pkg not in deps and pkg not in {"flutter", "flutter_test", "integration_test"}:
                    if pkg != "aqar_rent_mobile":
                        problems.append(f"PUBSPEC {f.relative_to(ROOT)}: '{pkg}' not declared")
                continue
            if uri.startswith("dart:"):
                continue
            target = (f.parent / uri).resolve()
            if not target.exists():
                problems.append(f"IMPORT {f.relative_to(ROOT)}: missing {uri}")
                continue
            tt, _ = parse(target)
            names = declared_names(tt)
            if names and not (names & ids):
                problems.append(f"UNUSED {f.relative_to(ROOT)}: {uri}")

    # i18n keys
    i18n = (MOBILE / "lib/core/i18n.dart").read_text(encoding="utf-8")
    keys = set(re.findall(r"^\s{2}'([a-z0-9_]+)':\s*\{", i18n, re.M))
    def entry_block(key: str) -> str:
        m = re.search(r"^  '" + re.escape(key) + r"':", i18n, re.M)
        if not m:
            return ""
        nxt = re.search(r"^  '[a-z0-9_]+':", i18n[m.end():], re.M)
        return i18n[m.start(): m.end() + (nxt.start() if nxt else len(i18n))]

    missing_ar = [k for k in keys if "'ar':" not in entry_block(k)]
    missing_en = [k for k in keys if "'en':" not in entry_block(k)]
    if missing_ar:
        problems.append(f"I18N missing ar: {missing_ar}")
    if missing_en:
        problems.append(f"I18N missing en: {missing_en}")
    used_keys = set()
    for f, (_, data) in trees.items():
        if "test" in f.parts and f.parts[f.parts.index("mobile") + 1] in {"test", "integration_test"}:
            continue  # tests deliberately probe a missing key
        used_keys |= set(re.findall(r"\bs\(\s*'([a-z0-9_]+)'\s*\)", data.decode("utf-8", "replace")))
    unknown = used_keys - keys
    if unknown:
        problems.append(f"I18N unknown keys: {sorted(unknown)}")

    # router paths
    main_dart = (MOBILE / "lib/main.dart").read_text(encoding="utf-8")
    routes = set(re.findall(r"GoRoute\(\s*path:\s*'([^']+)'", main_dart))
    for f, (_, data) in trees.items():
        text = data.decode("utf-8", "replace")
        for route in re.findall(r"context\.go\(\s*'([^']+)'\s*\)", text):
            if route not in routes:
                problems.append(f"ROUTE {f.relative_to(ROOT)}: '{route}' not declared in main.dart")

    # API paths against generated OpenAPI
    schema = json.loads((ROOT / "docs/openapi.json").read_text(encoding="utf-8"))
    api_paths = [p.replace("/api/v1", "") for p in schema["paths"]]
    def norm(p: str) -> list[str]:
        p = p.split("?")[0]
        p = re.sub(r"\$\{[^}]+\}", "{x}", p)
        p = re.sub(r"\$[A-Za-z_][A-Za-z0-9_]*", "{x}", p)
        return p.split("/")
    def path_exists(p: str) -> bool:
        parts = norm(p)
        for candidate in api_paths:
            cparts = candidate.split("/")
            if len(cparts) != len(parts):
                continue
            if all(a == b or (a.startswith("{") and b.startswith("{")) or (a.startswith("{") and b and not b.startswith("?") and not b.startswith("{"))
                   for a, b in zip(cparts, parts)):
                return True
        return False

    api_problems: list[str] = []
    for f, (_, data) in trees.items():
        text = data.decode("utf-8", "replace")
        for call in re.findall(r"api(?:\.\w+)?\.(?:get|post|patch|delete|cachedGet|upload|downloadBytes)\(\s*'([^']+)'", text):
            if not path_exists(call):
                api_problems.append(f"API {f.relative_to(ROOT)}: '{call}' not in OpenAPI")
    problems += api_problems

    if problems:
        print(f"FAILED ({len(problems)} problems)")
        for p in problems:
            print(" -", p)
        return 1
    print(
        f"OK: {len(dart_files)} Dart files, 0 syntax errors, {len(keys)} i18n keys "
        f"({len(used_keys)} used), {len(routes)} routes, {len(api_paths)} API paths"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
