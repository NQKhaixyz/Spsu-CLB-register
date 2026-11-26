# Nhịp Đội

Website quản lý họp tuần, phiếu điểm danh, lịch trực C1 và báo cáo Excel theo tháng.

## Bắt đầu sử dụng

1. Mở website và đăng nhập bằng MSSV/tên đăng nhập cùng mật khẩu Đội. Không cần tài khoản OpenAI. Hai tài khoản khởi tạo là `admin` (BĐH) và `member` (thành viên thử); mật khẩu được cấu hình riêng trong bí mật runtime, không nằm trong mã nguồn. Quyền BĐH của tài khoản chủ được giữ nguyên khi chuyển từ cách đăng nhập cũ.
2. Có thể chọn **Xem dữ liệu mẫu** để trải nghiệm. Sau khi nhập và ghép lịch rảnh, vào **Lịch rảnh → Dùng danh sách này làm chính thức**. Hệ thống giữ danh sách thật, các tài khoản và lịch trực từ file; lưu riêng dữ liệu mẫu; mở tuần cho danh sách chính thức. Không tạo MSSV thay cho thông tin còn thiếu.
3. Vào **Thành viên → Nhập Excel**, tải file mẫu rồi nhập danh sách. BĐH bấm **Mật khẩu** ở dòng thành viên để cấp tài khoản. Thành viên chưa có trong danh sách có thể tự đăng ký bằng họ tên, MSSV và mật khẩu; tài khoản tự đăng ký luôn có quyền thành viên.
4. Vào **Lịch trực C1 → Nhập lịch rảnh** hoặc **Lịch rảnh → Nhập lịch rảnh**. Mẫu MSSV có các cột ca rảnh nhận 1/x/có/rảnh; ca bận để trống hoặc 0. Cột cuối ghi nguyện vọng trực thêm. File chi tiết có bốn cột đầu **Họ và tên, Thứ, Buổi, Tuần học**, cột thứ năm là ghi chú tùy chọn: hệ thống cho xem trước rồi lưu nguyên từng dòng tại **Lịch rảnh**. Đặt mốc tuần học, ngày bắt đầu, giờ hai ca và tháng cần xếp, rồi bấm **Áp dụng và xếp lịch nháp**. Người chưa có MSSV được tạo hồ sơ theo tên, chờ BĐH bổ sung MSSV tại **Thành viên → Chỉnh sửa** trước khi cấp tài khoản.
5. Đặt các hệ số A–E và ngày trực trong **Cài đặt Đội**. D là mức trừ mỗi lượt BĐH tích đi muộn. E là mức cộng mỗi phiếu điểm danh đạt, mặc định 0. BĐH chọn tháng bắt đầu áp dụng.
6. Chọn tháng, **Xếp lịch nháp**, kiểm tra các ca thiếu người, chỉnh hoặc bỏ ca nghỉ, rồi **Công bố lịch**.
7. Trong **Họp hằng tuần**, đặt ngày họp trong tuần tự mở; BĐH tích vắng thực tế/có phép/đạt phiếu điểm danh và chốt.
8. Sau khi xác minh với thầy cô, mở từng ca để ghi nhận kết quả trực hoặc đổi người thay. Người trực thay chỉ được cộng A sau khi xác minh đã trực.
   Nếu buổi trực không diễn ra, BĐH mở ca và bấm **Hủy cả ca** một lần cho tất cả người được phân công. Ca hủy không cộng/trừ điểm; **Khôi phục ca** đưa lại đúng phân công và kết quả trước khi hủy. Cách này áp dụng cho cả lịch nháp và lịch đã công bố.
9. Vào **Báo cáo tháng → Xuất Excel**. Có dữ liệu thiếu thì tệp ghi rõ BẢN TẠM. Tệp gồm Tổng hợp tháng, Chi tiết họp, Chi tiết trực, Quy tắc điểm.

## Quy tắc đã triển khai

- Tuần thứ Hai–Chủ nhật theo Asia/Ho_Chi_Minh. Ngày họp quyết định tháng của họp và phiếu điểm danh; ngày trực quyết định tháng của trực.
- Khi BĐH tích đạt phiếu điểm danh, thành viên được cộng E theo ngày họp. Bỏ tích hoặc hủy buổi họp gỡ khoản cộng tương ứng.
- Chưa đăng ký / Tham gia / Xin vắng / Chưa xử lý là bốn nhóm riêng. Xin vắng cần lý do. Đổi từ vắng sang tham gia cần BĐH duyệt.
- Chốt thủ công hoặc tự chốt chuyển Chưa đăng ký và Chưa xử lý thành vắng. Yêu cầu đang chờ giữ lý do và tình trạng có phép ban đầu.
- Mặc định lý do xin vắng được xem là có phép, BĐH có thể đổi lại. Chưa đăng ký không có lý do chuyển vắng không phép khi chốt.
- BĐH rà soát người đăng ký nhưng không đến bằng ô Vắng. Đăng ký tham gia chưa bị tích vắng được xem là có mặt khi chốt.
- Hai ca trực/người/tháng là **mức ưu tiên, không phải giới hạn**. Chia lượt đầu và lượt thứ hai trước khi phân thêm; khi có người muốn trực thêm, ưu tiên họ cho các lượt vượt mức.
- BĐH chọn **Số người / 1 buổi trực C1** (1–50, mặc định 2) khi xếp lịch nháp hoặc áp dụng file lịch rảnh. Số người được lưu theo lịch và từng ca; không thay đổi lịch đã công bố. Thuật toán chọn ca khó xếp trước và ưu tiên lượt ít; ca thiếu vẫn hiển thị để BĐH chỉnh.
- **Hủy công bố lịch trực** dành cho BĐH: rút các ca chưa xác minh từ ngày bấm theo giờ Việt Nam đến hết Chủ nhật về nháp. Giữ nguyên các ngày trước đó, kết quả đã xác minh và điểm. BĐH có thể đổi người hoặc xếp lại số người mỗi ca trong phạm vi này đến hết tuần, rồi công bố lại.
- **Hủy chốt cuộc họp** luôn hiện cho BĐH, chỉ bật khi tuần đã chốt và cần ghi lý do. Khôi phục đăng ký trước khi chốt nếu có bản lưu và chưa được BĐH sửa; giữ kết quả đã xác minh. Tuần cũ không có bản lưu giữ nguyên dữ liệu hiện tại. Điểm vắng họp chỉ tính lại khi chốt. Tuần cũ mở để sửa phải được BĐH chốt lại; tuần hiện tại vẫn tự chốt khi hết tuần.
- Excel chi tiết đồng bộ lịch rảnh vào ô tích trong hồ sơ thành viên khi đã có cấu hình giờ ca. Các ô chưa sửa tay giữ điều kiện giờ và tuần học từ Excel; ô được BĐH tích/bỏ tích và lưu sẽ ưu tiên theo lựa chọn đó khi xếp lịch. Nhập lại Excel vẫn giữ các điều chỉnh tay. Người chưa khớp hồ sơ cần được đối chiếu trước khi áp dụng.
- Lịch rảnh theo mẫu MSSV cập nhật dữ liệu rảnh cố định và giữ các ô đã sửa tay, không sửa lịch đã công bố. Lịch đã công bố chỉ chỉnh từng ca để giữ kết quả xác minh. Bản Excel chi tiết theo tuần học được lưu riêng cho BĐH xem và lọc, không tạo MSSV hay tài khoản giả. Bản chi tiết được giữ lại khi chuyển từ dữ liệu mẫu sang dữ liệu thật.
- Mốc đang áp dụng: tuần học 11 là 09–15/11/2026; sáng 08:30–11:30, chiều 14:00–17:30. Đọc tuần theo khoảng, danh sách hoặc trừ tuần. Chỉ chọn người rảnh tới hết ca và bắt đầu không muộn quá 30 phút; các khoảng liên tiếp trong cùng ngày được gộp. Không coi 08:00–10:00 là rảnh cả ca sáng. Cột ghi chú cuối file được bỏ qua khi xếp lịch theo yêu cầu BĐH.
- Bảng **Theo dõi trực và đến muộn** cho BĐH nhập ghi chú và tích Đến muộn sau khi công bố. Tích ô sẽ trừ D điểm; bỏ tích sẽ hoàn lại khoản trừ đó. Không có ô miễn trừ: nếu lý do hợp lệ, BĐH xem ghi chú và không tích Đến muộn. Nội dung ghi chú không tự thay đổi điểm hoặc ô tích. Ghi chú dự kiến cho người rảnh từ 14:30 không tự tích kết quả đến muộn thực tế.
- Điểm = A × trực đủ − B × vắng trực không phép − C × vắng họp không phép − D × đi muộn. Điểm A/B tính theo kết quả xác minh; D tính riêng ngay khi BĐH tích trên lịch đã công bố. Bản nháp không tính điểm. Ca vắng hoặc hủy sẽ bỏ ô đến muộn để tránh trừ chồng. Excel có số lượt và số điểm trừ đi muộn ở cả tổng hợp và chi tiết.
- Thành viên mới không bị tính vắng các tuần trước. Ngừng hoạt động vẫn giữ lịch sử và báo cáo tháng liên quan.
- Sửa kết quả họp đã chốt cần lý do. BĐH không thể hạ quyền hoặc ngừng hoạt động chủ quản trị.
- Dữ liệu lưu ở Cloudflare D1, không phụ thuộc trình duyệt. Cập nhật có kiểm tra phiên bản để tránh hai BĐH ghi đè.

## Tự động chốt tuần

Ngày 10/11/2026, chủ quản trị yêu cầu xóa toàn bộ họp và trực của tuần 02–08/11/2026, rồi bổ sung cả ngày 01/11/2026. Endpoint bảo trì áp dụng đúng phạm vi cố định 01–08/11 một lần, lưu các bản ghi bị xóa ở `club_week_trash` trong cùng giao dịch, và ghi mốc xóa để đồng bộ/xếp lịch không tạo lại dữ liệu đã xóa. Ngày 01/11 chỉ loại ca trực ngày đó và cuộc họp có ngày họp 01/11, không loại ca trực 26–31/10. Bản khôi phục không được trả về API workspace và không tính vào báo cáo. Nhật ký và dữ liệu ngoài khoảng này được giữ nguyên.

Yêu cầu dọn tuần 26/10–01/11/2026 có bản khôi phục riêng `owner-delete-week-2026-10-26`. Phạm vi gồm họp, ca trực, sự kiện kết thúc trong tuần, đăng ký hoạt động và điểm cộng/trừ thuộc tuần. Mỗi lần gọi lại chỉ kiểm tra biên nhận đã lưu.

`POST /api/maintenance` không nhận đầu vào. Nó chỉ đồng bộ lịch theo giờ Việt Nam, đóng các tuần đã hết hạn và mở tuần hiện tại. JSON trả về `ok`, `changed`, `currentWeek`, `timezone`. Có thể gọi lại an toàn.

Website mở công khai; người dùng đăng nhập bằng tài khoản Đội để xem và sửa dữ liệu cá nhân. Mật khẩu được lưu dưới dạng PBKDF2-SHA256 với salt riêng; phiên đăng nhập dùng cookie HttpOnly, Secure trên HTTPS, và chỉ lưu hash token trong cơ sở dữ liệu. Có giới hạn số lần thử đăng nhập. Các biến bí mật `INITIAL_ADMIN_PASSWORD`, `INITIAL_MEMBER_PASSWORD` chỉ dùng để khởi tạo tài khoản ban đầu; không đặt lại mật khẩu đã được đổi. Mọi người có thể tự đổi mật khẩu trong menu; BĐH có thể cấp lại mật khẩu cho thành viên. Để thử hai vai trò song song, mở admin ở cửa sổ thường và member ở cửa sổ ẩn danh. Tác vụ đám mây liên kết gọi endpoint lúc 00:00 thứ Hai, lấy quyền truy cập dịch vụ từ công cụ Sites tại mỗi lần chạy; không ghi token vào mã nguồn hoặc lịch. Mỗi lần đọc/ghi của người dùng cũng đồng bộ lịch để khôi phục khi tác vụ chưa chạy. Nếu không truy cập nhiều tuần, hệ thống bù các tuần bị bỏ qua; BĐH phải bổ sung ngày họp hoặc đánh dấu nghỉ trước khi báo cáo.

## Phát triển

Mèo Bông dùng tranh SVG tự vẽ (`components/furball-art.tsx`), tham khảo phong cách
mèo tròn mềm của [Pet Furball](https://ddrkirbyisq.itch.io/pet-furball), không dùng
mã nguồn hay tài sản của trò chơi. `lib/screen-pet.ts` xử lý chuyển động toàn màn
hình, theo chuột, vuốt ve, giữ để bóp mềm, kéo/thả và quán tính. Menu cạnh mèo có
cho ăn, chơi bóng, lăn, mưa nhỏ, sấy khô và ngủ/đánh thức. Âm thanh tổng hợp chỉ
bật khi người dùng chọn; có thể ẩn/gọi mèo. Hai tùy chọn này lưu trên trình duyệt.
Nhân vật né điều khiển, hỗ trợ cảm ứng/bàn phím, giữ vị trí khi đổi trang, dừng
khi tab/pet bị ẩn và tôn trọng giảm chuyển động. Không dùng WebGL, Sylva hoặc
dữ liệu máy chủ cho pet; dữ liệu và điểm Đội độc lập hoàn toàn.

Ứng dụng dùng Node >=22.13, React 19, Vinext/Vite, Cloudflare Workers, D1, R2 và ExcelJS.

Trên PowerShell, khởi tạo cơ sở dữ liệu local mới và chạy bản build bằng các lệnh sau.

```powershell
npm ci
npm run build
Get-ChildItem drizzle/*.sql | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Migration $($_.Name)" }
}
npm start
```

Với cơ sở dữ liệu đã có, chỉ chạy các migration còn thiếu theo thứ tự số. Trước khi khởi động Wrangler, đặt `INITIAL_ADMIN_PASSWORD` và `INITIAL_MEMBER_PASSWORD` riêng cho bản thử trong tệp `.dev.vars` cạnh cấu hình `dist/server/wrangler.json`. Mở địa chỉ local do Wrangler in ra. D1 lưu hồ sơ và điểm, R2 lưu ảnh minh chứng của ca trực và sự kiện.

```text
node scripts/test-club.mjs
node node_modules/typescript/bin/tsc --noEmit
node tests/native-flow.mjs
```

Migration chỉ khai báo cấu trúc. Dữ liệu mẫu chỉ được BĐH chủ động nạp trong ứng dụng, không nằm trong migration. `.openai/hosting.json` giữ ID Site; không tái sử dụng ID khi dựng Site độc lập khác.

Kiểm thử `tests/native-flow.mjs` chỉ chấp nhận máy chủ loopback. Nó dùng dữ liệu thử local, kiểm tra đăng nhập hai vai trò, phân quyền, gửi/duyệt yêu cầu, đăng ký, cấp mật khẩu, đổi mật khẩu và thu hồi phiên. Không chạy bộ fixture này trên production.

## Đăng ký hoạt động và điểm tuần

- Trong Tạo sự kiện, chỉ BĐH tạo sự kiện với tên, điểm/người và khoảng ngày bắt đầu–kết thúc. Thành viên xem trong Sự kiện, đăng ký một lần/sự kiện từ khi tạo đến hết ngày kết thúc theo giờ Việt Nam. BĐH duyệt mới cộng điểm một lần vào tuần/tháng của ngày kết thúc, không nhân số ngày và không cộng lặp khi duyệt lại. Không đăng ký, chưa duyệt, không duyệt hoặc rút đăng ký không trừ điểm và không tính vắng. Sửa kết quả đã duyệt phải ghi lý do. Có thể rút đăng ký đang chờ rồi đăng ký lại trước khi sự kiện kết thúc; dùng cùng bản ghi để tránh trùng.
- BĐH có thể sửa tên, ngày và điểm hoặc hủy sự kiện sau khi tạo. Điểm đã duyệt cập nhật theo điểm và ngày kết thúc mới. Khi hủy, trang ngừng nhận đăng ký, giữ lịch sử và gỡ điểm của sự kiện khỏi bảng điểm. Danh sách sự kiện công khai cho thành viên, thông tin đăng ký chỉ cho BĐH và chính người đăng ký.
- Trong **Tạo sự kiện → Thêm người đã tham gia**, BĐH chọn thành viên và bấm **Xác nhận tham gia** để ghi điểm ngay vào tuần và tháng kết thúc sự kiện. Xác nhận trực tiếp miễn bước đăng ký và gửi ảnh. Với sự kiện đã kết thúc, bật **Hiện cả sự kiện đã kết thúc hoặc đã hủy** để tìm lại. Mỗi người chỉ có một lượt cho mỗi sự kiện.
- BĐH nhập số lượt nguyên cho Sáng kiến và Đồng đẳng viên. Điểm riêng và Điểm theo ban được nhập trực tiếp. Mỗi mục lưu một giá trị cho từng thành viên trong tuần. Lưu lại thay số cũ, nhập 0 để bỏ điểm mục đó.
- Sáng kiến và Đồng đẳng viên lấy số lượt nhân với mức điểm trong Cài đặt Đội theo tháng của ngày ghi nhận. Tổng điểm gồm họp, trực, phiếu điểm danh, sáng kiến, đồng đẳng viên, sự kiện, điểm theo ban và điểm riêng, sau khi trừ các khoản trừ.
- Mỗi tuần thứ Hai–Chủ nhật theo giờ Việt Nam có số lượt riêng, không sao chép số tuần trước. Lịch sử vẫn được giữ. Tab Điểm hàng tuần công khai cho mọi thành viên đã đăng nhập, chỉ trả số lượt và điểm tổng hợp của người khác; ghi chú và đăng ký riêng không được công khai.
- Excel tiếp tục xuất theo tháng. Các cột điểm cuối bảng lần lượt là Sáng kiến, Đồng đẳng viên, Sự kiện, Điểm theo ban, Điểm riêng và Điểm trừ. Chi tiết hoạt động có tên sự kiện, ngày bắt đầu/kết thúc, ngày/tuần tính điểm, trạng thái và điểm. Tuần giao tháng phân theo ngày ghi nhận.

- BĐH dùng nút Trừ điểm của từng thành viên để nhập số điểm dương và lý do bắt buộc. Mỗi lần lưu tạo một khoản riêng, trừ đúng số điểm vào tuần/tháng của ngày ghi nhận; không nhân hệ số. Mã khoản trừ giúp chống cộng trùng khi gửi lại. BĐH có thể hủy khoản nhập nhầm kèm lý do, giữ toàn bộ lịch sử; thành viên chỉ thấy lý do của chính mình. Tổng điểm và Excel luôn bao gồm khoản trừ còn hiệu lực.

- Điểm theo ban: trong Thành viên → Điểm cộng / trừ → Nhập điểm, BĐH chọn Điểm theo ban, chọn ban rồi nhập số điểm trực tiếp cho từng thành viên trong tuần. Lưu lại thay thế mục điểm của tuần; chọn Không ghi điểm theo ban để bỏ. Bản ghi theo mức điểm cũ giữ giá trị theo ngày ghi nhận cho đến khi BĐH sửa.

- Giảng đường, C2 và dự án được ghi điểm qua Tạo sự kiện. Bản ghi theo các mục cũ được lưu trong cơ sở dữ liệu và được loại khỏi bảng điểm, tổng điểm và báo cáo hiện tại.

- Tab Thành viên có Hồ sơ, Điểm cộng / trừ và Lịch rảnh. Phần ghi điểm tuần và lịch sử khoản trừ nằm ở Điểm cộng / trừ; chọn tuần trước khi nhập. Tab Tạo sự kiện dùng để quản lý sự kiện và duyệt đăng ký. Thành viên thường xem điểm riêng và lý do trừ của mình tại Góc thành viên.
- Tài khoản thành viên có hai chế độ xem trong **Điểm hàng tuần** và **Báo cáo tháng**. Chọn **Điểm của tôi** để xem dòng của mình hoặc **Toàn Đội** để xem điểm từng người trong kỳ. Trong **Góc thành viên**, nút **Xem điểm toàn Đội** mở bảng điểm tuần.
- Trong **Thành viên → Hồ sơ**, BĐH chọn **Thêm thành viên** hoặc **Chỉnh sửa** rồi tích các ban thành viên tham gia. Một người có thể thuộc nhiều ban trong số Truyền thông, Sự kiện, Chuyên môn và Điều hành. **Lọc theo ban** hiển thị người đó trong từng ban đã chọn ở cả Hồ sơ và Điểm cộng / trừ. Bỏ hết dấu tích để đưa hồ sơ về **Chưa phân ban**. Quyền BĐH được quản lý qua trường Vai trò.
- Trong **Cài đặt cá nhân → Phông chữ**, mỗi người có thể xem thử Inter, Nunito, Lexend hoặc Spectral. Lựa chọn được lưu riêng vào tài khoản và dùng lại khi đăng nhập trên thiết bị khác. Phông mặc định là Inter.
- Nhập lịch rảnh từ Excel chỉ mở tại Lịch trực C1. Sau khi nhập bản chi tiết, đối chiếu tại Thành viên → Lịch rảnh; chỉnh ô lịch rảnh lặt vặt tại Hồ sơ → Chỉnh sửa. Luồng đồng bộ Excel/ô tick và xếp lịch giữ nguyên.
