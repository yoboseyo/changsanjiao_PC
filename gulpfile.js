var lodash = require('lodash');
var path = require('path');
var mkdirp = require('mkdirp');
var gulp = require('gulp');
var gulpPlugins = require('gulp-load-plugins')();
var browserSync = require('browser-sync');
var reload = browserSync.reload;
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var watchify = require('watchify');
var es = require('event-stream');
var glob = require('glob');
var fs = require('fs');

// 获取命令行参数
var minimist = require('minimist');
var options = minimist(process.argv.slice(2), {
  boolean: ["o"]
});

// 引入配置项
var config = require('./config.json');
config = lodash.assign({},{
  "srcPath":"src/",
  "buildPath": "dist/",
  "devPath": "dev/",

  "jsPath":"js/",
  "scssPath":"scss/",
  "pugPath":"pug/",
  "publicPath":"public/",
  "staticsPath":"statics/"
},config);
lodash.forEach(config,function (n,i) {
  if(i.lastIndexOf('Path')=== i.length-4 && n.lastIndexOf('/') !== n.length-1) config[i] = n + '/';
});
var projectConfig = require('./'+config.srcPath + 'config.json');

function pugFun(allFile, isProd) {
  var b = gulp.src([config.srcPath + config.pugPath + '**/*.pug'])
    .pipe(gulpPlugins.data(function (file) {
      var stringData = String(file.contents).match(/\/\/-var\s*{(\s+["|']{1}\w*["']{1}:["|']{1}.*\s*["',]{1}\s+)*\/\/-}/gi);
      var data = {pageTitle: path.parse(file.path).name, environment: isProd ? 'build' : 'dev'};
      for (var i in stringData) {
        data = lodash.assign({},data, JSON.parse(stringData[i].replace(/\/\/-var|\/\/-|\n|\r/g, '')));
      }
      return data;
    }))
    .pipe(gulpPlugins.plumber());
  if (!allFile) {
    b = b.pipe(gulpPlugins.changed(config.devPath, {extension: '.html'}));
  }

  b = b.pipe(gulpPlugins.pug({pretty: true}))
    .on('error', gulpPlugins.util.log)
    .pipe(gulp.dest(isProd ? config.buildPath : config.devPath));
  return isProd ? b : b.pipe(reload({stream: true}));
}

function scssFun(allFile, isProd) {
  var b = gulp.src([config.srcPath + config.scssPath + '**/*.scss']);
  if (!allFile) {
    b = b.pipe(gulpPlugins.changed(config.devPath, {extension: '.css'}));
  }

  b = b.pipe(gulpPlugins.sass({outputStyle: (isProd ? 'compressed' : 'expanded')})
    .on('error', gulpPlugins.sass.logError))
    .pipe(gulp.dest((isProd ? config.buildPath : config.devPath) + 'css'));

  return isProd ? b : b.pipe(reload({stream: true}));
}

function copyFun(allFile, isProd) {
  var b = gulp.src([config.srcPath + config.staticsPath + '**/*'], {base: config.srcPath + config.staticsPath});

  if (!allFile) {
    b = b.pipe(gulpPlugins.changed(config.devPath));
  }
  b = b.pipe(gulp.dest(isProd ? config.buildPath : config.devPath));
  return isProd ? b : b.pipe(reload({stream: true}));
}

/**
 * 构建项目
 */
gulp.task('build', gulpPlugins.sequence('buildClean', 'buildBrowserify', 'buildMultifunctional', 'buildImageCompression', 'buildCssSpriter','buildConcat', 'buildEnd','buildDeleteEmpty'));
gulp.task('dev', gulpPlugins.sequence('devClean', 'devServer'));

/**
 * 自动刷新live-reloading
 */
gulp.task('devServer', ['devPugPublic', 'devScssPublic', 'devCopy', 'devBrowserify'], function () {
  browserSync({
    notify: false,
    open: options.o,
    port: 3000,
    server: {
      baseDir: config.devPath
    }
  });

  gulp.watch([config.srcPath + config.pugPath + '**/*.pug'], ['devPug'], reload);
  gulp.watch([config.srcPath + config.scssPath + '**/*.scss'], ['devScss'], reload);
  gulp.watch(config.srcPath + config.publicPath + '**/*.pug', ['devPugPublic'], reload);
  gulp.watch(config.srcPath + config.publicPath + '**/*.scss', ['devScssPublic'], reload);
  gulp.watch([config.srcPath + config.staticsPath + '**/*'], ['devCopy'], reload);
  gulp.watch(config.srcPath + config.jsPath + '**/*.js', ['devBrowserify'], reload);
});

/**
 * 构建项目任务
 */
gulp.task('devClean', function () {
  return gulp.src(config.devPath, {read: false})
    .pipe(gulpPlugins.clean({force: true}));
});

gulp.task('devPug', function () {
  return pugFun();
});

gulp.task('devPugPublic', function () {
  return pugFun(true);
});

gulp.task('devScss', function () {
  return scssFun();
});

gulp.task('devScssPublic', function () {
  return scssFun(true);
});

var watchedJs = [];
gulp.task('devBrowserify', function (done) {
  glob(config.srcPath + config.jsPath + '**/*.js', function (err, files) {
    if (err) done(err);
    var newFile = [];
    files.map(function (entry, i) {
      var pathParse = path.parse(entry);
      if (lodash.indexOf(watchedJs, pathParse.name) === -1) {
        watchedJs.push(pathParse.name);
        newFile.push(entry);
      }
    });

    var tasks = newFile.map(function (entry) {
      var b = watchify(browserify(lodash.assign({}, watchify.args, {
        entries: [entry],
        debug: true
      })))
        .on('update', browserifyTask);

      function browserifyTask() {
        return b.bundle()
          .pipe(source(path.parse(entry).base))
          .pipe(gulp.dest(config.devPath + 'js'))
          .pipe(browserSync.reload({stream: true}));
      }

      return browserifyTask();
    });
    es.merge(tasks).on('end', done);
  });
});

gulp.task('devCopy', function () {
  return copyFun();
});

gulp.task('buildClean', function () {
  return gulp.src(config.buildPath, {read: false})
    .pipe(gulpPlugins.clean({force: true}));
});

gulp.task('buildBrowserify', function (done) {
  glob(config.srcPath + config.jsPath + '**/*.js', function (err, files) {
    if (err) done(err);

    var outputs = files.map(function (page) {
      var p = path.parse(page.replace(config.srcPath, config.buildPath).replace(config.jsPath, 'js/'));
      mkdirp.sync(p.dir);
      return p.dir + '/' + p.name + p.ext;
    });

    var b = browserify(files);
    b.plugin('factor-bundle', {outputs: outputs});

    var task = b.bundle()
      .pipe(source("vendor.js"))
      .pipe(gulp.dest(config.buildPath + "js"));

    es.merge(task).on('end', done);
  });
});

/**
 * 图片压缩
 */
var imageminMozjpeg = require('imagemin-mozjpeg');
var imageminPngquant = require('imagemin-pngquant');
gulp.task('buildImageCompression', function (done) {
  var minTools = [];

  var _srcFile = [config.srcPath + config.staticsPath + '**/*.{png,jpg,gif,jpeg,svg,PNG,JPG,GIF,JPEG,SVG}', '!' + config.srcPath + config.staticsPath + 'icons/**/*.{png,jpg,gif,jpeg,svg,PNG,JPG,GIF,JPEG,SVG}'];
  if(projectConfig.compressionImage.enable){
    for (var i in projectConfig.compressionImage.exclude) {
      _srcFile.push('!' + config.srcPath + config.staticsPath + projectConfig.compressionImage.exclude[i]);
    }
    minTools = [
      gulpPlugins.imagemin.gifsicle(),
      imageminMozjpeg({quality: projectConfig.compressionImage.quality}),
      imageminPngquant()
    ]
  }else{
    minTools = [
      gulpPlugins.imagemin.gifsicle(),
      gulpPlugins.imagemin.jpegtran(),
      gulpPlugins.imagemin.optipng()
    ]
  }
  return gulp.src(_srcFile)
    .pipe(gulpPlugins.imagemin(minTools, {optimizationLevel: 1}))
    .pipe(gulp.dest(config.buildPath));
});

/**
 * 多功能集合
 */
gulp.task('buildMultifunctional', function (done) {
  var tasks = [];
  tasks.push(pugFun(true, true));
  tasks.push(scssFun(true, true));
  tasks.push(copyFun(true, true));
  es.merge(tasks).on('end', done);
});

/**
 * 生成雪碧图
 */
gulp.task('buildCssSpriter', function (done) {
  glob(config.buildPath + 'css/**/*.css', function (err, files) {
    if (err) done(err);
    var tasks = [];
    for (var i = 0; i < files.length; i++) {
      tasks.push(gulp.src(files[i])
        .pipe(gulpPlugins.cssSpriterDookay({
          spriteSheet: config.buildPath + 'images/sprite-' + i + '.png',
          pathToSpriteSheetFromCSS: '../images/sprite-' + i + '.png',
          spritesmithOptions: {
            padding: 10
          },
          matchReg: {
            pattern: "\.\./icons\/"
          }
        }))
        .pipe(gulpPlugins.autoprefixer('last 2 versions'))
        .pipe(gulpPlugins.cleanCss())
        .pipe(gulp.dest(config.buildPath + 'css')));
    }
    es.merge(tasks).on('end', done);
  });
});

// 合并css和js
gulp.task('buildConcat', function (done) {
  var tasks = [];

  // 删除html中合并的项
  var concatJs = [];
  for (var i in projectConfig.concatJs){
    for(var t in projectConfig.concatJs[i].items){
      concatJs.push(projectConfig.concatJs[i].items[t]);
    }
  }
  var concatCss = [];
  for (var i in projectConfig.concatCss){
    for(var t in projectConfig.concatCss[i].items){
      concatCss.push(projectConfig.concatCss[i].items[t]);
    }
  }
  tasks.push(gulp.src(config.buildPath + '*.html')
    .pipe(gulpPlugins.replace(/<link(?:.*?)rel=[\"\']stylesheet[\"\'](?!<)(?:.*)\>/gi,function (match, p1, offset, string) {
      var _asset = match.match(/(?![\"|\'])(\/?([\w|-]\/?\.?)+\.css)(?=[\"|\'])/gi);
      if(lodash.isArray(_asset)  && lodash.findIndex(concatCss, function(chr) {
          return chr === _asset[0];
        }) !== -1){
        return '';
      }
      return match;
    }))
    .pipe(gulpPlugins.replace(/<script(?:.*?)src=[\"\'](.+?)[\"\'](?!<)(?:.*)\>(?:[\n\r\s]*?)(?:<\/script>)/gi,function (match, p1, offset, string) {
      var _asset = match.match(/(?![\"|\'])(\/?([\w|-]\/?\.?)+\.js)(?=[\"|\'])/gi);
      if(lodash.isArray(_asset) && lodash.findIndex(concatJs, function(chr) {
          return chr === _asset[0];
        }) !== -1){
        return '';
      }
      return match;
    }))
    .pipe(gulpPlugins.htmlmin({
      collapseWhitespace: true,
      collapseBooleanAttributes: true,
      removeEmptyAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      minifyCSS: true
    }))
    .pipe(gulpPlugins.htmlBeautify({
      indent_size: 4,
      indent_char: ' ',
      unformatted: true,
      extra_liners: []
    }))
    .pipe(gulp.dest(config.buildPath))
  );

  // 合并js
  for (var i in projectConfig.concatJs){
    var js = [];
    for(var t in projectConfig.concatJs[i].items){
      if(!projectConfig.concatJs[i].items[t]) continue;
      js.push(config.buildPath + projectConfig.concatJs[i].items[t]);
    }
    if(js.length > 0){
      if(fs.existsSync(config.buildPath + projectConfig.concatJs[i].target)){
        js.unshift(config.buildPath + projectConfig.concatJs[i].target);
      }
      var targetJs = path.parse(projectConfig.concatJs[i].target);
      tasks.push(gulp.src(js)
        .pipe(gulpPlugins.concat(targetJs.base))
        .pipe(gulpPlugins.uglify())
        .pipe(gulp.dest(config.buildPath+(targetJs.root?'/':'')+targetJs.dir)));
    }
  }

  // 合并css
  for (var i in projectConfig.concatCss){
    var css = [];
    for(var t in projectConfig.concatCss[i].items){
      if(!projectConfig.concatCss[i].items[t]) continue;
      css.push(config.buildPath + projectConfig.concatCss[i].items[t]);
    }
    if(css.length > 0){
      if(fs.existsSync(config.buildPath + projectConfig.concatCss[i].target)){
        css.unshift(config.buildPath + projectConfig.concatCss[i].target);
      }
      var targetCss = path.parse(projectConfig.concatCss[i].target);
      tasks.push(gulp.src(css)
        .pipe(gulpPlugins.concat(targetCss.base))
        .pipe(gulpPlugins.cleanCss())
        .pipe(gulp.dest(config.buildPath+(targetCss.root?'/':'')+targetCss.dir)));
    }
  }

  // 删除合并的css和js文件
  es.merge(tasks).on('end', done);
});

gulp.task('buildEnd', function (done) {
  var tasks = [],
    cleanFiles = [];
  // 删除合并的js和css
  for (var i in projectConfig.concatJs){
    for(var t in projectConfig.concatJs[i].items){
      if(!projectConfig.concatJs[i].items[t]) continue;
      cleanFiles.push(config.buildPath + projectConfig.concatJs[i].items[t]);
    }
  }
  for (var i in projectConfig.concatCss){
    for(var t in projectConfig.concatCss[i].items){
      if(!projectConfig.concatCss[i].items[t]) continue;
      cleanFiles.push(config.buildPath + projectConfig.concatCss[i].items[t]);
    }
  }
  if(cleanFiles.length > 0){
    tasks.push(gulp.src(cleanFiles, {read: false})
      .pipe(gulpPlugins.clean({force: true}))
    );
  }

  // 删除小图标
  tasks.push(gulp.src(config.buildPath + 'icons', {read: false})
    .pipe(gulpPlugins.clean({force: true})));

  es.merge(tasks).on('end', done);
});

// 删除icons文件夹
gulp.task('buildDeleteEmpty', function (done) {
  require('delete-empty').sync(config.buildPath);
});

/**
 * 工具任务，输入目录tools目录，输出目录tools/dist
 */

//  合并压缩js
gulp.task('toolsConcatJs',function (done) {
  var tasks = [],
    toolsConfig = require('./tools/config.json'),
    toolsPath = './tools/';

  for (var i in toolsConfig.concatJs){
    var js = [];
    for(var t in toolsConfig.concatJs[i].items){
      if(!toolsConfig.concatJs[i].items[t]) continue;
      var _file = toolsPath + toolsConfig.concatJs[i].items[t];
      js.push(_file.replace('//','/'));
    }
    if(js.length > 0){
      if(fs.existsSync(toolsPath + 'dist/' + toolsConfig.concatJs[i].distName)){
        js.unshift(toolsPath + 'dist/' + toolsConfig.concatJs[i].distName);
      }
      tasks.push(gulp.src(js)
        .pipe(gulpPlugins.concat(toolsConfig.concatJs[i].distName))
        .pipe(gulpPlugins.uglify())
        .pipe(gulp.dest(toolsPath + 'dist/')));
    }
  }
  es.merge(tasks).on('end', done);
});

// 合并压缩css
gulp.task('toolsConcatCss',function (done) {
  var tasks = [],
    toolsConfig = require('./tools/config.json'),
    toolsPath = './tools/';

  for (var i in toolsConfig.concatCss){
    var css = [];
    for(var t in toolsConfig.concatCss[i].items){
      if(!toolsConfig.concatCss[i].items[t]) continue;
      var _file = toolsPath + toolsConfig.concatCss[i].items[t];
      css.push(_file.replace('//','/'));
    }
    if(css.length > 0){
      if(fs.existsSync(toolsPath + 'dist/' + toolsConfig.concatCss[i].distName)){
        css.unshift(toolsPath + 'dist/' + toolsConfig.concatCss[i].distName);
      }
      tasks.push(gulp.src(css)
        .pipe(gulpPlugins.concat(toolsConfig.concatCss[i].distName))
        .pipe(gulpPlugins.cleanCss())
        .pipe(gulp.dest(toolsPath + 'dist/')));
    }
  }

  es.merge(tasks).on('end', done);
});

// 压缩图片
gulp.task('toolsImageCompression', function (done) {
  var minTools = [],
    toolsConfig = require('./tools/config.json'),
    toolsPath = './tools/';
  if(!toolsConfig.imageCompression.sourcePath) return true;
  var _srcFile = [toolsPath + toolsConfig.imageCompression.sourcePath + '/**/*.{png,jpg,gif,jpeg,svg,PNG,JPG,GIF,JPEG,SVG}'];
  minTools = [
    gulpPlugins.imagemin.gifsicle(),
    imageminMozjpeg({quality: 90}),
    imageminPngquant()
  ];
  return gulp.src(_srcFile)
    .pipe(gulpPlugins.imagemin(minTools, {optimizationLevel: 1}))
    .pipe(gulp.dest(toolsPath + 'dist/' + toolsConfig.imageCompression.distPath));
});