#!/data/data/com.termux/files/usr/bin/bash
# Anne's Base: create the GitHub repository, set its description, homepage and topics from
# AnnesBase.meta.json, commit this folder if it has no commits yet, and push.
#
# Run in Termux (works in any bash with git, GitHub CLI and jq):
#   pkg install -y git gh jq
#   gh auth login            # GitHub.com, HTTPS, log in with a browser; grant "repo" scope
#   gh auth setup-git
#   bash scripts/termux-setup.sh             # public repository, like the sister apps
#   bash scripts/termux-setup.sh --private   # private instead
#
# Environment overrides: OWNER (default socrtwo), REPO (default AnnesBase).
# Safe to re-run: each step checks whether it was already done.
set -euo pipefail

OWNER="${OWNER:-socrtwo}"
REPO="${REPO:-AnnesBase}"
VISIBILITY="--public"
[[ "${1:-}" == "--private" ]] && VISIBILITY="--private"

cd "$(dirname "$0")/.."
META="AnnesBase.meta.json"

for tool in git gh jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "✗ $tool is missing. In Termux: pkg install -y git gh jq"; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "✗ Not logged in to GitHub. Run: gh auth login && gh auth setup-git"; exit 1; }
[[ -f "$META" ]] || { echo "✗ $META not found; run this from the AnnesBase folder"; exit 1; }

DESC="$(jq -r '.description' "$META")"
HOMEPAGE="$(jq -r '.homepage // ""' "$META")"
TOPICS="$(jq -r '.topics | join(",")' "$META")"
LOGIN="$(gh api user --jq .login)"
UID_NUM="$(gh api user --jq '.id|tostring')"

echo "== Local repository"
if [[ ! -d .git ]]; then
  git init -q -b main
  echo "✓ initialized"
fi
if ! git rev-parse --verify -q HEAD >/dev/null; then
  git add -A
  git -c user.name="$LOGIN" -c user.email="${UID_NUM}+${LOGIN}@users.noreply.github.com" \
    commit -q -m "Anne's Base: project plan, database survey, command inventory, classic menu layouts, AI, recovery and code plans"
  echo "✓ first commit"
else
  echo "✓ already has commits ($(git rev-parse --short HEAD))"
fi
git branch -M main

echo "== GitHub repository $OWNER/$REPO"
if gh repo view "$OWNER/$REPO" --json name >/dev/null 2>&1; then
  echo "✓ already exists"
else
  gh repo create "$OWNER/$REPO" "$VISIBILITY" --description "$DESC"
  echo "✓ created ($VISIBILITY)"
fi

echo "== Description, homepage and topics"
gh repo edit "$OWNER/$REPO" --description "$DESC" --enable-issues
[[ -n "$HOMEPAGE" ]] && gh repo edit "$OWNER/$REPO" --homepage "$HOMEPAGE"
gh repo edit "$OWNER/$REPO" --add-topic "$TOPICS"
echo "✓ $(echo "$TOPICS" | tr ',' '\n' | wc -l) topics"

echo "== Push"
URL="https://github.com/$OWNER/$REPO.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$URL"
else
  git remote add origin "$URL"
fi
# An empty repository has no branches; ask git directly rather than the API.
if ! git ls-remote --heads origin 2>/dev/null | grep -q refs/heads/; then
  git push -u origin main
  echo "✓ pushed"
else
  git fetch -q origin main
  if git merge-base --is-ancestor origin/main HEAD; then
    git push -u origin main && echo "✓ up to date on GitHub"
  else
    echo "✗ GitHub has commits this folder does not. Inspect with: git log --oneline HEAD..origin/main"
    exit 1
  fi
fi

echo
echo "Done: https://github.com/$OWNER/$REPO"
