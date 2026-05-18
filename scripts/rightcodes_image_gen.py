#!/usr/bin/env python3
"""Generate images through the right.codes draw proxy.

Supports prompt-only generation and grounded generation with repeated image
inputs. The endpoint is OpenAI-compatible enough for simple image generation
jobs used by hatch-pet.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable, List


DEFAULT_ENDPOINT = "https://www.right.codes/draw/v1/images/generations"
DEFAULT_MODEL = "gpt-image-2"


def die(message: str, code: int = 1) -> None:
    print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(code)


def read_prompt(prompt: str | None, prompt_file: str | None) -> str:
    if prompt and prompt_file:
        die("Use --prompt or --prompt-file, not both.")
    if prompt_file:
        path = Path(prompt_file)
        if not path.exists():
            die(f"Prompt file not found: {path}")
        return path.read_text(encoding="utf-8").strip()
    if prompt:
        return prompt.strip()
    die("Missing prompt. Use --prompt or --prompt-file.")
    return ""


def encode_image(path_str: str) -> str:
    path = Path(path_str)
    if not path.exists():
        die(f"Image file not found: {path}")
    mime, _ = mimetypes.guess_type(path.name)
    if not mime:
        mime = "application/octet-stream"
    raw = path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def build_payload(args: argparse.Namespace, prompt_text: str) -> dict:
    payload = {
        "model": args.model,
        "prompt": prompt_text,
        "size": args.size,
        "quality": args.quality,
        "n": 1,
    }
    if args.image:
        payload["image"] = [encode_image(path) for path in args.image]
    if args.response_format:
        payload["response_format"] = args.response_format
    return payload


def request_json(endpoint: str, api_key: str, payload: dict, timeout: int) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        die(f"HTTP {exc.code} from draw API: {details}", code=exc.code)
    except urllib.error.URLError as exc:
        die(f"Request failed: {exc}")
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        die(f"Invalid JSON response: {exc}")
    return {}


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_from_url(url: str, out_path: Path, timeout: int) -> None:
    ensure_parent(out_path)
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            data = response.read()
    except urllib.error.URLError as exc:
        die(f"Failed to download generated image: {exc}")
    out_path.write_bytes(data)


def write_from_b64(value: str, out_path: Path) -> None:
    ensure_parent(out_path)
    out_path.write_bytes(base64.b64decode(value))


def save_result(result: dict, out_path: Path, timeout: int) -> None:
    data = result.get("data")
    if not isinstance(data, list) or not data:
        die(f"Unexpected response payload: {json.dumps(result, ensure_ascii=False)}")
    first = data[0]
    if not isinstance(first, dict):
        die(f"Unexpected image item: {first!r}")
    if "b64_json" in first:
        write_from_b64(first["b64_json"], out_path)
        return
    if "url" in first:
        write_from_url(first["url"], out_path, timeout)
        return
    die(f"Response did not contain b64_json or url: {json.dumps(first, ensure_ascii=False)}")


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prompt")
    parser.add_argument("--prompt-file")
    parser.add_argument("--image", action="append", default=[], help="Repeatable input image path.")
    parser.add_argument("--out", required=True, help="Output PNG/WebP/JPEG path.")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--size", default="1024x1024")
    parser.add_argument("--quality", default="high")
    parser.add_argument("--response-format", default="url")
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--api-key-env", default="OPENAI_API_KEY")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    prompt_text = read_prompt(args.prompt, args.prompt_file)
    api_key = os.getenv(args.api_key_env)
    if not api_key:
        die(f"{args.api_key_env} is not set.")
    payload = build_payload(args, prompt_text)
    result = request_json(args.endpoint, api_key, payload, args.timeout)
    out_path = Path(args.out)
    save_result(result, out_path, args.timeout)
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
