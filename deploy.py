import hashlib, json, subprocess, sys, os

def run(args, data=None):
    return subprocess.run(args, input=data, capture_output=True).stdout.decode()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
proj = sys.argv[1] if len(sys.argv) > 1 else "ritish-pitwall"
token = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("VERCEL_TOKEN")
auth_headers = ["-H", f"Authorization: Bearer {token}"] if token else []

files = []
for dp, _, fs in os.walk(root):
    if "node_modules" in dp:
        continue
    for f in fs:
        p = os.path.join(dp, f)
        b = open(p, "rb").read()
        sha = hashlib.sha1(b).hexdigest()
        cmd = ["curl", "-s", "-X", "POST", "https://api.vercel.com/v2/files",
               "-H", "Content-Type: application/octet-stream",
               "-H", f"x-vercel-digest: {sha}"] + auth_headers + ["--data-binary", "@-"]
        run(cmd, b)
        files.append({"file": os.path.relpath(p, root), "sha": sha, "size": len(b)})

body = json.dumps({
    "name": proj,
    "project": proj,
    "target": "production",
    "files": files,
    "projectSettings": {
        "framework": None,
        "outputDirectory": "public",
        "installCommand": "npm install",
        "buildCommand": ""
    }
})

deploy_cmd = ["curl", "-s", "-X", "POST",
              "https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1",
              "-H", "Content-Type: application/json"] + auth_headers + ["-d", "@-"]
raw_resp = run(deploy_cmd, body.encode())
try:
    j = json.loads(raw_resp)
    print(json.dumps({k: j.get(k) for k in ("id", "readyState", "url", "alias", "error")}))
except Exception as e:
    print(f"Error parsing response: {e}\nRaw output: {raw_resp}")

patch_cmd = ["curl", "-s", "-X", "PATCH",
             f"https://api.vercel.com/v9/projects/{proj}",
             "-H", "Content-Type: application/json"] + auth_headers + ["-d", json.dumps({"ssoProtection": None})]
run(patch_cmd)
