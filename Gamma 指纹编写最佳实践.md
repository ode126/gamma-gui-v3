# Gamma 指纹编写最佳实践

# 注意事项

**建议阅读并掌握**

1、通过增加 - 参数 ，可以自动清理规则尾部多余的 \n 换行数据`expression: |-`

2、在处理所有的 404 页面时统一使用 `get404Path()`  函数获取路径，保证在一次扫描中，同一个目标将只有一个404path

3、请勿匹配Set-Cookie响应头的关键字，因为引擎在做批量扫描时会先访问一次根路径，所以之后的请求包中通常不会有Set-Cookie的响应头，导致无法命中。可以采用 `no_cookie` 参数进行处理；

```yaml
rules:

  kw_in_header:
    request:
      cache: true
      follow_redirects: false
      method: GET
      path: /
      no_cookie: true
    expression: |-
      response.headers['set-cookie'].contains('adscsrf')
      && response.headers['set-cookie'].contains('_zcsr_tmp')
      && response.headers['set-cookie'].contains('JSESSIONIDADSSP')

```

# 常见场景

## Example1

```text/x-yaml
name: hzcms
transport: http

detail:
  cpe: hingesoft:hzcms
  version: '{{version}}'
  
rules:

  kw_in_body:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /
    expression: |-
      response.body_string.contains("/cms/cmsadmin/infopub/search.jsp")
      && response.body_string.contains("Produced By CMS 网站群内容管理系统")

expression: kw_in_body()

# FOFA QUERY
# body="/cms/cmsadmin/infopub/search.jsp"

```

## Example2

```text/x-yaml
name: weaver-e-cology-oa
transport: http

detail:
  cpe: weaver:weaver_e_cology_oa
  version: '{{version}}'

rules:

  version_in_body_00:
    request:
      method: GET
      path: /
    expression: |
      (
      	response.body_string.contains('/login/LoginOperation.jsp') 
        || response.body_string.contains('/login/Login.jsp?logintype=1')
      ) && response.body_string.contains('/help/sys/help.html')
    output:
      version: string("v8")
    
  version_in_body_01:
    request:
      method: GET
      path: /
    expression: response.body_string.contains('/wui/common/') ||
                response.body_string.contains('/wui/index.html')
    output:
      version: string("v9")

  keyword_in_cookie:
    request:
      cache: true
      follow_redirects: false
      method: GET
      path: /
    expression: |
      response.raw_header.ibcontains(b"ecology_JSessionid")

expression: version_in_body_00() || version_in_body_01() || keyword_in_cookie()

# FOFA
# category="办公自动化系统（OA）" && product="泛微-E-Weaver"
```

## Example3

```text/x-yaml
name: yonyou_nc_cloud
transport: http

detail:
  cpe: yonyou:yonyou_nc_cloud
  version: '{{version}}'

rules:
  index_contains:
    expression: |-
      response.body_string.contains('/platform/resource/yonyou-yyy.js')
      && response.body_string.contains('/platform/resource/ca/nccsign.js')
      
  js_redirect:
    expression: |-
      response.body_string.contains('<meta http-equiv=refresh content=0;url=nccloud>')
      || (response.body_string.contains('window.location.href="platform/pub/welcome.do";')
      && response.body_string.contains('window.location.href="html/downloadBroswer.html";'))

  version_detect:
    request:
      method: GET
      path: /nccloud/resources/sscpfm/index.html
    expression: true
    output:
      search: |
          '<meta name="Build-Time" content="(?P<version>.*?)">'.submatch(response.body_string)
      version: search['version']

expression: (index_contains() || js_redirect())
            && version_detect()
```

## 通过 icon 的 hash 判断指纹

icon文件hash值可通过fofa查询获得，或使用icon hash计算器：[https://github.com/Becivells/iconhash](https://github.com/Becivells/iconhash)

```text/x-yaml
rules:
    get_icon_hash:
      request:
        cache: true
        follow_redirects: true
        method: GET
        path: /
      expression: |-
        faviconHash(response.getIconContent()) == 149371702
 
```

## 通过 icon 的 hash 判断指纹 2

```text/x-yaml
rules:
  favicon_hash:
    request:
      cache: true
      follow_redirects: false
      method: GET
      path: /favicon.ico
    expression: faviconHash(response.body) == 947874108

```

## 综合的 icon 比对指纹

```text/x-yaml
rules:

  get_icon_hash:
    request:
      cache: true
      follow_redirects: false
      method: GET
      path: /
    expression: |-
      faviconHash(response.getIconContent()) in [149371702,123,456]

  get_icon_hash_redirect:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /
    expression: |-
      faviconHash(response.getIconContent()) == 149371702
     
  base_favicon_hash:
    request:
      cache: true
      follow_redirects: false
      method: GET
      path: /favicon.ico
    expression: faviconHash(response.body) == 149371702

expression: (get_icon_hash() || get_icon_hash_redirect() || base_favicon_hash())
    
```

## 通过 icon 的链接判断指纹

```text/x-yaml
rules:
    get_icon_url:
      request:
        cache: true
        follow_redirects: true
        method: GET
        path: /
      expression: |-
        response.icon_url.contains("/get-asm/favicon.ico")
```

## 常见请求路径

```plaintext
/
/favicon.ico
/581c3123af46f6f5
```

## 关键词在目标 content 对象中

```text/x-yaml
# 二进制对象匹配
kw_in_body:
  request:
    cache: true
    method: GET
    path: /
    follow_redirects: false
	expression: |-
    response.body.bcontains(b"/coremail/help/index")

# 纯文本匹配 UTF-8
expression: |-
	response.body_string.contains("<hr><center>openresty")
  
# 忽略大小写
expression: |-
	response.body_string.icontains("Coremail")

# 存在双引号的情况 
expression: |-
	response.body_string.contains('href="https://www.cloudflare.com/5xx-error-landing"')

```

## 关键词在目标 cookie 对象中

```text/x-yaml
# 匹配 set-cookie 方法
expression: |-
	"set-cookie" in response.headers 
  && response.headers["set-cookie"].contains("spring")

# 更加简洁的写法
expression: response.headers['set-cookie'].icontains("alimail_sdata0")

# 简单粗暴法
expression: |-
	response.raw_header.bcontains(b"CameraServer=")

```

## 关键词在目标 header 对象中

```text/x-yaml
expression: |-
  ( "server" in response.headers 
    && response.headers["server"].contains("nginx")
  )
```

## 关键词在目标cert对象中

```plaintext
response.raw_cert.ibcontains(b"SANGFOR VMP") 
```

## 比对文件的 md5 

```text/x-yaml
expression: |-
	md5(response.body) == "ce1a1c8754948c6cbfcfa48545e8174b"
```

## 文件 MD5 值快速计算

```text/x-sh
#! /bin/bash

if [ ! -n "$1" ] ;then 
    echo "$0 <target>"
    exit 1
fi

TARGET=$1
curl -s -o /tmp/md5_tmp_file ${TARGET}

# Mac
md5 /tmp/md5_tmp_file

# Linux
# md5sum /tmp/md5_tmp_file

# Windows
certutil -hashfile favicon.ico md5

```

## 通过404页面特征判断指纹

```yaml
name: xxxxx
transport: http
detail:
  cpe: xxxx
set:
  pathname: get404Path()
rules:
  kw_in_404_body:
    request:
      method: GET
      path: /{{pathname}}
    expression: response.body_string.contains("xxxx")
expression: kw_in_404_body()

```

## 当关键字在header中或者网页进行了多次跳转的推荐写法，对跳转和非跳转的情况都进行一次判断

```plaintext
name: openrasp
transport: http

detail:
  cpe: baidu:openrasp
  version: '{{version}}'
  
rules:

  kw_in_header:
    request:
      cache: true
      follow_redirects: false
      method: GET
      path: /
    expression: |-
      response.raw_header.ibcontains(b"X-Protected-By: OpenRASP")
      && response.raw_header.ibcontains(b"X-Request-Id")

  kw_in_header_301:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /
    expression: |-
      response.raw_header.ibcontains(b"X-Protected-By: OpenRASP")
      && response.raw_header.ibcontains(b"X-Request-Id")

expression: kw_in_header() || kw_in_header_301()

```

## 使用三目表达式简化二级目录与根目录相同特征的指纹写法

```plaintext
payloads:
  payloads:
    path_0:
      path: |
        "/"
    path_1:
      path: |
        "/yapi"
rules:
  kw_in_body_00:
    request:
      method: GET
      path: ^{{path}}
    expression: |-
      response.body_string.contains('xxx')
      && response.body_string.contains('xxx')
  kw_in_body_01:
    request:
      method: GET
      path: ^{{path}}
    expression: |-
      response.body_string.contains('xxx')
      && response.body_string.contains('xxx')
```

## 正则表达式

正则表达式的匹配有 2 种情况

*   通过正则来判断目标的返回内容，是否命中`预设特征`
    
    *   Unicode 文本
        
    *   Bytes 二进制
        
*   通过正则来搜索匹配出目标的版本信息数据
    
    *   Unicode 文本
        
    *   Bytes 二进制
        

## 正则判断目标的返回结果是否命中预设特征 - matches

```yaml
  get_icon_url:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /
    expression: |-
      response.body_string.contains('rel="shortcut icon"')
      && "/owa/auth/.*?/themes/resources/favicon.ico".matches(response.icon_url)

```

## 文本类型正则匹配版本 - submatch

```text/x-yaml
# nginx 指纹参考 nginx/nginx.yml
version_in_header:
  request:
    cache: true
    method: GET
    path: /
  expression: |
    "server" in response.headers && response.headers["server"].contains("nginx")
  output:
    search: | 
      "^nginx/(?P<version>.*)$".submatch(response.headers["server"])
    version: search["version"]
```

## 二进制类型正则匹配版本 - bsubmatch

```text/x-yaml
# openresty 指纹处理参考 openresty/openresty/yml
regexp_in_body:
  request:
    cache: true
    method: GET
    path: /581c3123af46f6f5
    follow_redirects: false
  expression: |
    "<hr><center>openresty/(.*)</center>".matches(response.body_string)
  output:
    search: |
      "<center>openresty/(?P<version>.*)</center>".bsubmatch(response.body)
    version: search['version']
   
```

## 二进制类型正则匹配内容 - todo

## 正则提取返回包的某个路径，然后匹配该路径下的关键字

```yaml
rules:
  kw_in_body:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /
    expression: |-
      response.body_string.contains("class=load_title>正在加载系统资源，请耐心等待")
      && "src=/static/js/(?P<jsFile>[a-zA-Z0-9\.]+)></script></body></html>".matches(response.body_string)

    output:
      search: |
        "src=/static/js/(?P<jsFile>[a-zA-Z0-9\.]+)></script></body></html>".submatch(response.body_string)
      jsFile: search['jsFile']

  kw_in_jsfile:
    request:
      cache: true
      follow_redirects: false
      method: GET
      path: /static/js/{{jsFile}}
    expression: response.body_string.contains('url:"/log-access/v1/lm2_logfmt_field_count_views"')
                && response.body_string.contains("/api-user/rolepermission/getMenuId/")

expression: kw_in_body() && kw_in_jsfile()

```

## 动态正则语句的拼接写法，示例如下

```plaintext
# 
set:
  rStr1: randomLowercase(8)
......中间部分省略
 output:
      search: >-
        (string("\"id\":(?P<cid>[0-9]*?),\"containerName\":\"") + rStr1).bsubmatch(response.body)
      cid: search["cid"]
```

```plaintext
detail:
  cpe: gitlab:gitlab
  version: '{{version}}'
  revision: '{{revision}}'
......中间部分省略
    output:
      search: | 
        (revision + string("---(?P<version>.*?),")).submatch(hash_table)
      version: search["version"]
```

### 当需要output提取两个关键字时可以参考以下写法

```plaintext
    output:
      search: >-
        "\"test\":\"(?P<test>.+?)\"".submatch(response.body_string)
      test: search["test"]
      search1: >-
        "\"test1\":\"(?P<test1>.+?)\"".submatch(response.body_string)
      test1: search1["test1"]
```

## JS重定向规则写法

某些网站可能使用了js重定向的方式做了跳转而不是301或者302, 这种情况下需要手动增加一个适配js重定向的规则，示例如下：

```plaintext
rules:
  js_redirect:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /
    expression: response.body_string.contains("top.location='/index.jsp'")
  kw_in_body_01:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /index.jsp
    expression: response.body_string.contains("keyword1") 
                && (response.body_string.contains("keyword2")
expression: js_redirect() && kw_in_body_01()
```

## TCP指纹检测规则

```plaintext
  r0:
    request:
      cache: true
      content: ""
      read_timeout: "3"
    expression: |-
      response.raw.bcontains(b'keyword')
```

### 匹配返回状态码

建议状态码和关键字规则结合使用，只使用状态码做特征容易导致误报

```plaintext
response.status == 200 && response.body_string.contains("keyword1")
```

# TODO

## 快速开始模版

```yaml
name: test
transport: http

detail:
  cpe: test:test
  version: '{{version}}'
  
rules:
  kw_in_body:
    request:
      cache: true
      follow_redirects: true
      method: GET
      path: /
    expression: |-
      response.body_string.contains("keyword1")
      && response.body_string.contains("keyword2")

expression: kw_in_body()
```