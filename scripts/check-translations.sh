#!/usr/bin/env bash
set -euo pipefail

base_dir=$(cd "$(dirname "$0")/.." && pwd)
domain=yamap-block-gutenberg
languages="$base_dir/languages"
command -v wp >/dev/null 2>&1 || { printf 'WP-CLI (wp) is required to verify translations.\n' >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
(
    cd "$base_dir"
    wp i18n make-pot . "$work/fresh.pot" --slug="$domain" --domain="$domain" \
        --exclude=vendor,node_modules,tests,dist,production,output,assets,languages,scripts,docs,.release-baseline --quiet
)
mkdir -p "$work/json"
wp i18n make-json "$languages" "$work/json" --no-purge --use-map="$base_dir/scripts/i18n-map.json" >/dev/null

php -- "$languages" "$domain" "$work/fresh.pot" "$work/json" <<'PHP'
<?php
[, $dir, $domain, $fresh_pot, $fresh_json] = $argv;
$failures = 0;
$stderr = fopen('php://stderr', 'w');
$fail = static function (string $message) use (&$failures, $stderr): void {
    fwrite($stderr, 'TRANSLATION CHECK FAILED: ' . $message . "\n");
    ++$failures;
};
$unquote = static fn (string $quoted): string => stripcslashes(substr(trim($quoted), 1, -1));
$read_po = static function (string $file) use ($unquote): array {
    $messages = array();
    $fuzzy = array();
    $context = '';
    $id = null;
    $plural_id = null;
    $translations = array();
    $mode = '';
    $translation_index = 0;
    $is_fuzzy = false;
    $flush = static function () use (&$messages, &$fuzzy, &$context, &$id, &$plural_id, &$translations, &$is_fuzzy): void {
        if (null !== $id) {
            $key = ('' !== $context ? $context . "\x04" : '') . $id;
            if (null !== $plural_id) {
                $key .= "\0" . $plural_id;
                ksort($translations, SORT_NUMERIC);
            }
            $messages[$key] = implode("\0", $translations);
            if ($is_fuzzy) {
                $fuzzy[] = $key;
            }
        }
        $context = '';
        $id = null;
        $plural_id = null;
        $translations = array();
        $is_fuzzy = false;
    };
    foreach (file($file, FILE_IGNORE_NEW_LINES) as $line) {
        if ('' === trim($line)) {
            $flush();
            $mode = '';
        } elseif (str_starts_with($line, '#,') && str_contains($line, 'fuzzy')) {
            $is_fuzzy = true;
        } elseif ('#' === $line[0]) {
            continue;
        } elseif (str_starts_with($line, 'msgctxt ')) {
            $context = $unquote(substr($line, 8));
            $mode = 'context';
        } elseif (str_starts_with($line, 'msgid ')) {
            $id = $unquote(substr($line, 6));
            $mode = 'id';
        } elseif (str_starts_with($line, 'msgid_plural ')) {
            $plural_id = $unquote(substr($line, 13));
            $mode = 'plural';
        } elseif (preg_match('/^msgstr\[(\d+)\]\s/', $line, $match)) {
            $translation_index = (int) $match[1];
            $translations[$translation_index] = $unquote(substr($line, strlen($match[0])));
            $mode = 'str';
        } elseif (str_starts_with($line, 'msgstr ')) {
            $translation_index = 0;
            $translations[$translation_index] = $unquote(substr($line, 7));
            $mode = 'str';
        } elseif ('"' === $line[0]) {
            if ('context' === $mode) {
                $context .= $unquote($line);
            } elseif ('id' === $mode) {
                $id .= $unquote($line);
            } elseif ('plural' === $mode) {
                $plural_id .= $unquote($line);
            } elseif ('str' === $mode) {
                $translations[$translation_index] .= $unquote($line);
            }
        }
    }
    $flush();
    $header = $messages[''] ?? '';
    unset($messages['']);
    return array('messages' => $messages, 'fuzzy' => $fuzzy, 'header' => $header);
};
$read_mo = static function (string $file): array {
    $data = (string) file_get_contents($file);
    $magic = unpack('V', substr($data, 0, 4))[1] ?? 0;
    $format = 0x950412de === $magic ? 'V' : (0xde120495 === $magic ? 'N' : '');
    if ('' === $format) {
        throw new RuntimeException(basename($file) . ' is not a MO file.');
    }
    [, $count, $ids_at, $strs_at] = array_values(unpack($format . '4', substr($data, 4, 16)));
    $messages = array();
    for ($i = 0; $i < $count; ++$i) {
        [$id_length, $id_offset] = array_values(unpack($format . '2', substr($data, $ids_at + 8 * $i, 8)));
        [$str_length, $str_offset] = array_values(unpack($format . '2', substr($data, $strs_at + 8 * $i, 8)));
        $messages[substr($data, $id_offset, $id_length)] = substr($data, $str_offset, $str_length);
    }
    unset($messages['']);
    return $messages;
};
$same = static function (array $left, array $right): bool {
    ksort($left, SORT_STRING);
    ksort($right, SORT_STRING);
    return $left === $right;
};
$placeholders = static function (string $text): array {
    preg_match_all('/%(?:\d+\$)?[sdf]/', $text, $matches);
    $found = $matches[0];
    if (array() !== array_filter($found, static fn (string $placeholder): bool => str_contains($placeholder, '$'))) {
        sort($found);
    }
    return $found;
};
$pot_file = $dir . '/' . $domain . '.pot';
if (! is_file($pot_file)) {
    $fail('missing template ' . basename($pot_file));
    exit(1);
}
$template = array_keys($read_po($pot_file)['messages']);
$current = array_keys($read_po($fresh_pot)['messages']);
foreach (array_diff($current, $template) as $added) {
    $fail('source string missing from template: ' . substr($added, 0, 70));
}
foreach (array_diff($template, $current) as $removed) {
    $fail('obsolete template string: ' . substr($removed, 0, 70));
}
$summary = array();
foreach (glob($dir . '/' . $domain . '-*.po') ?: array() as $po_file) {
    $locale = substr(basename($po_file, '.po'), strlen($domain) + 1);
    $po = $read_po($po_file);
    foreach (array_diff($template, array_keys($po['messages'])) as $missing) {
        $fail("$locale: missing PO string: " . substr($missing, 0, 70));
    }
    foreach (array_diff(array_keys($po['messages']), $template) as $obsolete) {
        $fail("$locale: obsolete PO string: " . substr($obsolete, 0, 70));
    }
    foreach ($po['messages'] as $id => $translation) {
        foreach (explode("\0", $translation) as $translation_form) {
            if ('' === trim($translation_form)) {
                $fail("$locale: untranslated: " . substr($id, 0, 70));
            } elseif ($placeholders(explode("\0", $id)[0]) !== $placeholders($translation_form)) {
                $fail("$locale: placeholders differ: " . substr($id, 0, 70));
            }
        }
    }
    foreach ($po['fuzzy'] as $id) {
        $fail("$locale: fuzzy entry: " . substr($id, 0, 70));
    }
    if (! str_contains($po['header'], "Language: $locale\n") || ! str_contains($po['header'], 'Plural-Forms: ')) {
        $fail("$locale: invalid Language or Plural-Forms header");
    }
    $mo = substr($po_file, 0, -3) . '.mo';
    if (! is_file($mo)) {
        $fail("$locale: missing compiled MO");
    } elseif (! $same($read_mo($mo), $po['messages'])) {
        $fail("$locale: stale MO file");
    }
    $summary[] = sprintf('%s (%d strings)', $locale, count($po['messages']));
}
$expected_json = array();
foreach (glob($dir . '/' . $domain . '-*.json') ?: array() as $json) {
    $expected_json[basename($json)] = $json;
}
$fresh_files = glob($fresh_json . '/*.json') ?: array();
if (count($fresh_files) !== count($expected_json)) {
    $fail('editor JSON file count differs from a fresh build');
}
foreach ($fresh_files as $fresh) {
    $name = basename($fresh);
    if (! isset($expected_json[$name])) {
        $fail("unexpected editor JSON: $name");
    } elseif (! hash_equals(hash_file('sha256', $fresh), hash_file('sha256', $expected_json[$name]))) {
        $fail("stale editor JSON: $name");
    }
}
if ($failures > 0) {
    fwrite($stderr, sprintf("Translation check: %d problem(s).\n", $failures));
    exit(1);
}
printf("Translation check passed: %s; template matches %d source strings and compiled editor JSON.\n", array() === $summary ? 'no bundled translations' : implode(', ', $summary), count($template));
PHP
