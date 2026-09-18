# -*- coding: utf-8 -*-
import importlib.util, json, re, urllib.request, pathlib
html = urllib.request.urlopen('http://localhost:8000/').read().decode('utf-8')

def find(cat):
    return re.findall(r'<meta %s content="([^"]*)"' % cat, html)

o = {}
o['title'] = re.findall(r'<title>([^<]*)</title>', html)
o['description'] = find('name="description"')
o['keywords'] = find('name="keywords"')
o['robots'] = find('name="robots"')
o['og:title'] = find('property="og:title"')
o['og:description'] = find('property="og:description"')
o['og:image'] = find('property="og:image"')
o['og:type'] = find('property="og:type"')
o['itemprop:name'] = find('itemprop="name"')
o['itemprop:image'] = find('itemprop="image"')
o['twitter:card'] = find('name="twitter:card"')
o['twitter:title'] = find('name="twitter:title"')
o['canonical'] = find('link:') if False else re.findall(r'<link rel="canonical" href="([^"]*)"', html)
jsonld = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
o['jsonld'] = json.loads(jsonld[0]) if jsonld else None
print(json.dumps(ensure_ascii=False, obj=o, indent=2))