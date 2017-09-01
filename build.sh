#!/usr/bin/env bash
set -e

echo "Building bombonato.net"

bundle exec jekyll build

echo "Finished"
