const files = [
  './PreVideo.mp4',

  './Chair.mp4',
  './PW_PostSub.mp4',
  './Sermon.mp4',

  './PostVideo.mp4',
]

const facebookKey = ''

const command = `
ffmpeg
${files.map(x => `-re -i ${x}`).join(" ")}
-filter_complex " 
${files.map((x, i) => `[${i}:v] realtime, fps=fps=24, scale=w=min(iw*720/ih\\,1280):h=min(720\\,ih*1280/iw), pad=w=1280:h=720:x=(1280-iw)/2:y=(720-ih)/2  [video${i}]; `).join(" ")}
${files.map((x, i) => `[${i}:a] arealtime, anull [audio${i}];`).join(" ")}
${files.map((x, i) => `[video${i}][audio${i}]`).join('')} concat=n=${files.length}:v=1:a=1 [v][a]
" -map "[v]" -map "[a]" -pix_fmt yuv420p -c:v libx264 -vb 4000k -minrate 2000k -maxrate 4000k -g 30 -keyint_min 120 -profile:v baseline -preset fast -c:a aac -ar 44100 -b:a 128k  -f flv "rtmps://live-api-s.facebook.com:443/rtmp/${facebookKey}"
`

console.log(command.split('\n').join(' '))

// # GMT+1 so, 14:10 -> 13:10 UTC
// echo "bash run_stream.sh" | at 13:10