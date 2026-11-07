import hashlib,json,subprocess,sys,os
def run(args,data=None): return subprocess.run(args,input=data,capture_output=True).stdout.decode()
root=os.path.join(os.path.dirname(os.path.abspath(__file__)),"site"); proj=sys.argv[1]; files=[]
for dp,_,fs in os.walk(root):
    if "node_modules" in dp: continue
    for f in fs:
        p=os.path.join(dp,f); b=open(p,"rb").read(); sha=hashlib.sha1(b).hexdigest()
        run(["curl","-s","-X","POST","https://api.vercel.com/v2/files","-H","Content-Type: application/octet-stream","-H",f"x-vercel-digest: {sha}","--data-binary","@-"],b)
        files.append({"file":os.path.relpath(p,root),"sha":sha,"size":len(b)})
body=json.dumps({"name":proj,"project":proj,"target":"production","files":files,"projectSettings":{"framework":None,"outputDirectory":"public","installCommand":"npm install","buildCommand":""}})
j=json.loads(run(["curl","-s","-X","POST","https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1","-H","Content-Type: application/json","-d","@-"],body.encode()))
print(json.dumps({k:j.get(k) for k in ("id","readyState","url","alias","error")}))
run(["curl","-s","-X","PATCH",f"https://api.vercel.com/v9/projects/{proj}","-H","Content-Type: application/json","-d",json.dumps({"ssoProtection":None})])
