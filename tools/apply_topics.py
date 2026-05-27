#!/usr/bin/env python3
"""
One-off helper: insert a `topics: [...]` line into the front matter of
every career and blog post, immediately after the existing `tags:` line.

Topics are the curated, durable taxonomy used for MCP catalog reporting.
Tags remain free-form. See _data/topics.yml for the topic vocabulary.

Run from repo root: python3 tools/apply_topics.py
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Curated topic assignment for every post.
# Empty list = no topic applies (e.g. pure office/admin roles).
TOPICS: dict[str, list[str]] = {
    # Career posts
    "career/_posts/1996-06-01-Datacontrol.md": ["troubleshooting", "teaching"],
    "career/_posts/1997-01-01-Bitcompany.md": ["troubleshooting", "teaching"],
    "career/_posts/1997-10-01-LAOInd.md": [],
    "career/_posts/1998-08-01-LAOInd.md": [],
    "career/_posts/1999-01-01-Microlins.md": ["teaching"],
    "career/_posts/1999-02-01-LAOInd.md": ["data"],
    "career/_posts/2000-08-01-Megalan.md": ["consulting"],
    "career/_posts/2001-06-01-Uniara.md": ["troubleshooting", "teaching"],
    "career/_posts/2002-01-01-Unesp.md": ["troubleshooting"],
    "career/_posts/2003-01-01-Unimed.md": ["troubleshooting"],
    "career/_posts/2003-06-01-TAM.md": ["troubleshooting"],
    "career/_posts/2005-03-01-EDS.md": ["development"],
    "career/_posts/2008-01-01-TATA.md": ["development", "consulting", "architecture"],
    "career/_posts/2010-06-01-NET.md": ["architecture", "consulting"],
    "career/_posts/2011-01-01-Stefanini.md": ["development", "consulting"],
    "career/_posts/2012-04-01-Eldorado.md": ["development", "teaching"],
    "career/_posts/2013-03-01-SENAI.md": ["teaching"],
    "career/_posts/2014-02-01-ACCENTIX.md": ["consulting", "development"],
    "career/_posts/2014-08-01-Quality.md": ["development"],
    "career/_posts/2015-03-01-Wab.md": ["consulting", "development"],
    "career/_posts/2015-09-01-Unesp.md": ["development"],
    "career/_posts/2017-01-01-Citi.md": ["development", "devops-cloud", "architecture"],
    "career/_posts/2018-03-01-PAN.md": ["architecture", "devops-cloud", "security"],
    "career/_posts/2019-01-01-Brasilprev.md": ["architecture", "devops-cloud"],
    "career/_posts/2019-08-01-SAP.md": ["architecture", "consulting", "devops-cloud"],
    "career/_posts/2022-07-01-Salesforce.md": ["architecture", "marketing-tech"],
    "career/_posts/2025-02-01-Salesforce.md": ["consulting", "marketing-tech"],
    "career/_posts/2026-02-01-Salesforce.md": ["consulting", "marketing-tech"],
    # Blog posts
    "blog/_posts/2011-03-29-Instalacao-Diaspora-Desenvolvimento.md": ["tooling", "development"],
    "blog/_posts/2011-03-29-Instalacao-Redis-MACOS-x-Linux.md": ["tooling", "devops-cloud"],
    "blog/_posts/2011-04-04-Utilizando-Git.md": ["tooling", "development"],
    "blog/_posts/2011-07-01-Proxy-subversion.md": ["tooling", "troubleshooting"],
    "blog/_posts/2011-11-22-Assinando-JAR.md": ["security", "development"],
    "blog/_posts/2012-01-20-CSS-media-type.md": ["development"],
    "blog/_posts/2012-02-23-Motorola-defy-rooting.md": ["tooling"],
    "blog/_posts/2012-03-30-Comandos-maven.md": ["tooling", "development"],
    "blog/_posts/2012-04-15-JSF-Sprint-DI.md": ["development"],
    "blog/_posts/2012-07-18-JSF-Pag-erro-sessao-expirada.md": ["development", "troubleshooting"],
    "blog/_posts/2012-07-18-JSF-URL-redirect.md": ["development"],
    "blog/_posts/2012-09-17-App-web-java-maven-eclipse.md": ["development", "troubleshooting"],
    "blog/_posts/2012-11-19-log-auditoria-jpa-spring.md": ["development", "data"],
    "blog/_posts/2013-03-12-jquery-chosen-buscao-nao-funciona.md": ["development", "troubleshooting"],
    "blog/_posts/2013-03-26-apache-nao-sobe-80-apache.md": ["troubleshooting"],
    "blog/_posts/2013-08-27-problemas-upload-arquivos-spring-mvc.md": ["development", "troubleshooting"],
    "blog/_posts/2015-07-24-intellij-rodando-com-jvm-nova-macosx.md": ["tooling"],
    "blog/_posts/2016-08-31-problemas-com-segundo-monitor-macosx.md": ["tooling", "troubleshooting"],
    "blog/_posts/2016-09-05-copiar-chave-publica-ssh-sem-comando-tradicional.md": ["tooling", "security"],
    "blog/_posts/2016-10-18-rocketchat-ubuntu16-problema-notificacao.md": ["troubleshooting", "tooling"],
    "blog/_posts/2017-06-17-Criando-uma-pagina-com-Jektll.md": ["tooling", "development"],
    "blog/_posts/2017-10-04-update-passphrase-ssh-key.md": ["security", "tooling"],
    "blog/_posts/2019-07-22-rancher-aws-ecr.md": ["devops-cloud"],
    "blog/_posts/2021-04-11-macOS-bootable-usb.md": ["tooling"],
    "blog/_posts/2021-10-28-git-lfs.md": ["tooling", "development"],
}

TAGS_LINE_RE = re.compile(r"^tags:\s*\[.*?\]\s*$", re.MULTILINE)
TOPICS_LINE_RE = re.compile(r"^topics:\s*\[.*?\]\s*$", re.MULTILINE)


def render_topics(values: list[str]) -> str:
    return "topics: [" + ", ".join(values) + "]"


def apply(path: Path, topics: list[str]) -> bool:
    text = path.read_text(encoding="utf-8")
    rendered = render_topics(topics)

    if TOPICS_LINE_RE.search(text):
        new_text = TOPICS_LINE_RE.sub(rendered, text, count=1)
    else:
        match = TAGS_LINE_RE.search(text)
        if not match:
            print(f"  SKIP (no tags line found): {path}")
            return False
        insert_at = match.end()
        new_text = text[:insert_at] + "\n" + rendered + text[insert_at:]

    if new_text == text:
        return False

    path.write_text(new_text, encoding="utf-8")
    return True


def main() -> int:
    changed = 0
    for rel, topics in TOPICS.items():
        path = REPO_ROOT / rel
        if not path.exists():
            print(f"  MISSING: {rel}")
            continue
        if apply(path, topics):
            changed += 1
            print(f"  OK: {rel} -> {topics}")
    print(f"\nUpdated {changed} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
