FROM quay.io/travisci/travis-jvm

# Install a recent ruby (default is 1.9.3)
RUN chown -R travis /home/travis
RUN su - travis
RUN rvm install 2.3.3
RUN rvm use 2.3.3

# Install travis-build to generate a .sh out of .travis.yml
RUN cd builds
RUN git clone https://github.com/travis-ci/travis-build.git
RUN cd travis-build
RUN gem install travis

# to create ~/.travis
RUN travis

RUN ln -s `pwd` ~/.travis/travis-build
RUN bundle install

# Create project dir, assuming your project is `AUTHOR/PROJECT` on GitHub
#cd ~/builds
#mkdir AUTHOR
#cd AUTHOR
#git clone https://github.com/AUTHOR/PROJECT.git
#cd PROJECT
# change to the branch or commit you want to investigate
#travis compile > ci.sh
# You most likely will need to edit ci.sh as it ignores matrix and env
#bash ci.sh
