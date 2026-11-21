# ffmpeg 레시피 여덟 — exec 로 바로 하는 영상 일

영상 편집기 프로젝트를 열지 않고 끝낼 수 있는 일(자르기·붙이기·무음 빼기·세로 맞추기·자막·소리 크기·규격·장면 그림)은 exec 로 동봉 `ffmpeg`·`ffprobe` 를 부른다(설치·찾기 없이 이름으로 불린다). 사람에게 편집 패널을 열어 주고 「직접 하라」로 끝내지 않는다.

지킬 것:
- 원본은 덮어쓰지 않는다. 결과는 원본 옆에 새 이름(`원본이름-무음뺌.mp4` 처럼)으로 둔다. `IN`·`OUT` 만 바꿔 넣고 그대로 실행한다.
- 레시피마다 아래 「확인」을 돌리고, 그다음 `media_editor analyze{sources:[{path:OUT}]}` 로 결과 그림을 본다. 확인 전에는 「다 됐어요」라고 하지 않는다. 확인이 어긋나면 고쳐 다시 만든다.
- 막히면(파일 없음·소리 트랙 없음·명령 실패) 무엇이 막혔는지 사실(오류 줄)로 말하고, 할 수 있는 다른 길을 바로 한다.
- 여러 편이면 한 스크립트로 차례로 돌려도 된다. 다 만든 뒤 `analyze{sources:[…]}` 한 번으로 모두 본다.
- 종료 코드와 오류 본문을 함께 읽는다. 명령은 `-loglevel error` 라 정상이면 아무것도 찍지 않는다 — 종료 코드가 0이 아니거나, 0이어도 오류 줄이 찍혔거나, exec 가 시간 초과로 끊겼으면 완료가 아니다. 그 오류 줄을 그대로 말한다.
- ffmpeg 가 0으로 끝나도 결과가 맞다는 뜻은 아니다. 아래 「공통 확인」으로 실제 파일의 크기·길이·소리 트랙을 다시 읽어 기대와 맞을 때만 그 파일을 결과로 등록한다(등록하는 파일 = 확인한 그 파일).
- 확인은 세 가지를 따로 말한다: 구조(크기·길이·트랙, 공통 확인), 소리(무음 다시 재기·음량), 그림(analyze). `analyze`·장면 모음은 몇 장의 표본 그림이다 — 「전체를 다 봤다」고 하지 않고 「표본 N장을 봤다」고 한다. 재지 않은 것은 재지 않았다고 한다.

## 공통 확인 (모든 레시피 뒤)

`EXPECT_SIZE`(예: `1080x1920`, 안 따지면 비움), `EXPECT_SECONDS`(기대 길이, 안 따지면 비움), `TOLERANCE`(길이 허용, 기본 0.3초), `EXPECT_AUDIO`(소리 없어도 되면 `no`)를 넣고 돌린다. 「확인 실패」가 나오면 완료가 아니다.
```sh
P=$(ffprobe -v error -show_entries stream=codec_type,width,height:format=duration -of default=nw=1 "$OUT") || { echo "확인 실패: $OUT 을 읽지 못함"; exit 1; }
W=$(printf '%s\n' "$P" | sed -n 's/^width=//p' | head -1); H=$(printf '%s\n' "$P" | sed -n 's/^height=//p' | head -1)
D=$(printf '%s\n' "$P" | sed -n 's/^duration=//p' | tail -1); A=$(printf '%s\n' "$P" | grep -c '^codec_type=audio')
[ -z "$EXPECT_SIZE" ] || [ "${W}x${H}" = "$EXPECT_SIZE" ] || { echo "확인 실패: 크기 ${W}x${H} (기대 $EXPECT_SIZE)"; exit 1; }
[ -z "$EXPECT_SECONDS" ] || awk -v d="$D" -v e="$EXPECT_SECONDS" -v t="${TOLERANCE:-0.3}" 'BEGIN { exit !((d - e) <= t && (e - d) <= t) }' || { echo "확인 실패: 길이 ${D}초 (기대 ${EXPECT_SECONDS}±${TOLERANCE:-0.3})"; exit 1; }
[ "${EXPECT_AUDIO:-yes}" = no ] || [ "$A" -ge 1 ] || { echo "확인 실패: 소리 트랙 없음"; exit 1; }
echo "확인: ${W}x${H} ${D}초 소리 트랙 $A — $(shasum -a 256 "$OUT" | cut -c1-16)"
```

## ① 앞뒤 자르기 (START~END 초만 남김)

```sh
ffmpeg -hide_banner -loglevel error -y -ss "$START" -to "$END" -i "$IN" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"
```
확인: `ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"` 가 END−START(±0.1초).

## ② 이어 붙이기 (같은 크기 영상 둘 이상)

```sh
ffmpeg -hide_banner -loglevel error -y -i "$IN" -i "$IN2" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"
```
크기·비율이 다르면 ④로 먼저 같은 크기로 맞춘다. 셋이면 `-i` 와 `[2:v][2:a]` 를 더하고 `n=3`.
확인: 길이가 두 원본 길이의 합(±0.2초).

## ③ 말 없는 구간 빼기 (`silencedetect` → 남길 구간 계산 → 자르고 붙이기)

```sh
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
KEEP=$(ffmpeg -hide_banner -nostats -i "$IN" -af silencedetect=noise=-35dB:d=0.8 -f null - 2>&1 | awk -v D="$D" -v K=0.15 '
/silence_start/ { s = $NF; open = 1 }
/silence_end/   { e = $5; open = 0; if (e - s > 2 * K) cut[n++] = (s + K) " " (e - K) }
END { if (open && D - s > K) cut[n++] = (s + K) " " D
      p = 0; x = ""
      for (i = 0; i < n; i++) { split(cut[i], c, " "); if (c[1] > p + 0.05) x = x (x ? "+" : "") "between(t," p "," c[1] ")"; p = c[2] }
      if (D > p + 0.05) x = x (x ? "+" : "") "between(t," p "," D ")"
      print x }')
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "select='$KEEP',setpts=N/FRAME_RATE/TB" -af "aselect='$KEEP',asetpts=N/SR/TB" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"
```
- `noise=-35dB` 는 조용한 방의 말 기준. 뒤 소음이 크면 `-30dB`, 작은 목소리가 잘리면 `-40dB`. `d=0.8` 은 이보다 짧은 숨은 남긴다(말이 숨 막히게 붙지 않게). `K=0.15` 는 말 앞뒤로 남기는 여유(초).
- `KEEP` 가 비면 무음을 못 찾은 것이다 — 그 사실과 쓴 기준(-35dB, 0.8초)을 말하고 기준을 바꿔 한 번 더 잰다.
확인: 길이가 줄었는지(원본 대비 뺀 초) + 결과에 같은 `silencedetect`(d=2)를 다시 돌려 2초 넘는 무음 0곳.

## ④ 가로 → 세로 9:16 (1080×1920)

여백(그림 전체를 살리고 위아래 띠):
```sh
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"
```
가운데 채우기(양옆을 잘라 화면을 꽉 채움 — 사람이 가운데 있을 때):
```sh
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"
```
판 위 글자나 화면 가장자리 발표자가 잘리면 채우기 대신 여백을 쓴다(analyze 그림으로 고른다).
확인: `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$OUT"` 가 `1080,1920`.

## ⑤ 자막 입히기 (한국어 글꼴)

자막 파일(SRT)을 받아쓰기 시각으로 만들고 그 파일을 `SRT` 로 둔다. 경로의 공백·괄호가 필터를 깨므로 임시 폴더(`$TMPDIR`)에 짧은 이름으로 복사해서 쓴다 — 결과 폴더에는 결과만 둔다.
```sh
SUB="${TMPDIR:-/tmp}/t5-sub-$$.srt"; cp "$SRT" "$SUB"
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "subtitles=$SUB:fontsdir=/System/Library/Fonts:force_style='FontName=Apple SD Gothic Neo,Bold=1,FontSize=13,Outline=2,Shadow=0,Alignment=2,MarginV=110,MarginL=30,MarginR=30'" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT"
rm -f "$SUB"
```
- 글꼴: 맥은 운영체제 한국어 글꼴(Apple SD Gothic Neo), 윈도는 `fontsdir=C\:/Windows/Fonts` 와 `FontName=Malgun Gothic`. 글꼴을 못 찾으면 한글이 네모로 나온다 — analyze 그림으로 꼭 본다.
- 세로 영상에서 `MarginV=110` 은 자막 아랫줄을 화면 높이 약 62% 위로 올린다(인스타 아래 설명·단추 가림 구역 밖, SKILL.md 3절). 가로 영상은 `MarginV=20`.
확인: 길이가 원본과 같고, analyze 그림에서 자막 글자가 읽히고 가림 구역 밖에 있다.

## ⑥ 소리 크기 고르기 (`loudnorm`, 릴스·쇼츠 −14 LUFS)

```sh
ffmpeg -hide_banner -loglevel error -y -i "$IN" -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:v copy -c:a aac -b:a 160k -ar 48000 -movflags +faststart "$OUT"
```
확인: `ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128 -f null - 2>&1 | grep -A1 "Integrated loudness" | tail -1` 의 I 가 −14 ± 2 LUFS.

## ⑦ 용량·규격 맞추기 (인스타 릴스·유튜브 쇼츠 공통)

H.264 High·yuv420p·30fps·1080×1920·AAC 48kHz·앞쪽 색인(faststart). 올릴 곳의 용량 상한이 있으면 `MAXRATE` 를 낮춘다(1분에 약 60MB ≈ 8M).
```sh
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p" -c:v libx264 -profile:v high -preset veryfast -crf 21 -maxrate "${MAXRATE:-8M}" -bufsize 16M -c:a aac -b:a 128k -ar 48000 -movflags +faststart "$OUT"
```
확인: `ffprobe -v error -show_entries stream=codec_name,profile,width,height,pix_fmt,avg_frame_rate,sample_rate:format=size,duration -of json "$OUT"` 가 h264·High·1080·1920·yuv420p·30/1·aac·48000, 그리고 용량.

## ⑧ 장면 그림 뽑기 (장면이 바뀌는 곳을 한 장 모음으로)

```sh
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "select='eq(n\,0)+gt(scene\,0.3)',scale=320:-2,tile=4x3:padding=4" -fps_mode vfr -frames:v 1 "$OUT"
```
`OUT` 은 `.jpg`. 장면이 거의 안 바뀌는 영상(강의 한 화면)은 `select` 대신 `fps=1/10`(10초마다 한 장).
확인: `ffprobe` 로 그림 크기를 보고, 그 그림을 열어(첨부·analyze) 장면을 본다. 그림만 뽑고 안 본 채 「장면을 봤다」고 하지 않는다.
