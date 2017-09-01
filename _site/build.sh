#!/usr/bin/env bash
set -e

echo "Building bombonato.net"

bundle exec travis-lint
bundle exec jekyll build

echo "Finished"
