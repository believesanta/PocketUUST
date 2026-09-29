"""Build a distributable archive without local accounts, credentials or caches."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "releases" / "PocketUUST-hackathon.zip"
FILES = ["package.json", "package-lock.json", "index.html", "vite.config.ts",
         "tsconfig.json", ".gitignore", ".env.example", ".prettierrc.json",
         ".prettierignore", "README.md", "TEAM-GUIDE.md", "HOSTING.md"]
DIRECTORIES = ["src", "services", "scripts", "docs", "deploy", "dist"]

def public_file(file: Path) -> bool:
    relative = file.relative_to(ROOT)
    return (file.is_file() and not file.is_symlink()
            and "__pycache__" not in relative.parts
            and "superpowers" not in relative.parts
            and file.suffix not in {".pyc", ".log", ".sqlite", ".db", ".pem", ".key"}
            and not file.name.endswith(".last-success.json")
            and not file.name.endswith(".lock")
            and not file.name.startswith(".fetch-news"))

def package() -> None:
    if not (ROOT / "dist" / "index.html").is_file():
        raise SystemExit("Run npm run build before packaging.")
    OUTPUT.parent.mkdir(exist_ok=True)
    files = [ROOT / name for name in FILES]
    for name in DIRECTORIES:
        files.extend((ROOT / name).rglob("*"))
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(set(files)):
            if public_file(file):
                archive.write(file, Path("PocketUUST") / file.relative_to(ROOT))
    with ZipFile(OUTPUT) as archive:
        if archive.testzip() is not None:
            raise SystemExit("Archive verification failed.")
        print(f"{OUTPUT}\n{len(archive.namelist())} files; {OUTPUT.stat().st_size:,} bytes")

if __name__ == "__main__":
    package()
