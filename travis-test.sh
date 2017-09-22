docker run -it \
    -u travis \
    -v ~/workspace/macielbombonato/jekyll/macielbombonato.github.io/:/home/travis/builds/ \
    quay.io/travisci/travis-jvm \
    /bin/bash
