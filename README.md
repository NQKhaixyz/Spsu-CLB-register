# Nhịp CLB

Website quản lý họp tuần, quy chế, lịch trực C1 và báo cáo Excel theo tháng.

## Bắt đầu sử dụng

1. Mở website và đăng nhập bằng MSSV/tên đăng nhập cùng mật khẩu CLB. Không cần tài khoản OpenAI. Hai tài khoản khởi tạo là `admin` (BĐH) và `member` (thành viên thử); mật khẩu được cấu hình riêng trong bí mật runtime, không nằm trong mã nguồn. Quyền BĐH của tài khoản chủ được giữ nguyên khi chuyển từ cách đăng nhập cũ.
2. Có thể chọn **Xem dữ liệu mẫu** để trải nghiệm. Sau khi nhập và ghép lịch rảnh, vào **Lịch rảnh → Dùng danh sách này làm chính thức**. Hệ thống giữ danh sách thật, các tài khoản và lịch trực từ file; lưu riêng dữ liệu mẫu; mở tuần cho danh sách chính thức. Không tạo MSSV thay cho thông tin còn thiếu.
3. Vào **Thành viên → Nhập Excel**, tải file mẫu rồi nhập danh sách. BĐH bấm **Mật khẩu** ở dòng thành viên để cấp tài khoản. Thành viên chưa có trong danh sách có thể tự đăng ký bằng họ tên, MSSV và mật khẩu; tài khoản tự đăng ký luôn có quyền thành viên.
4. Vào **Lịch trực C1 → Nhập lịch rảnh** hoặc **Lịch rảnh → Nhập lịch rảnh**. Mẫu MSSV có các cột ca rảnh nhận 1/x/có/rảnh; ca bận để trống hoặc 0. Cột cuối ghi nguyện vọng trực thêm. File chi tiết có bốn cột đầu **Họ và tên, Thứ, Buổi, Tuần học**, cột thứ năm là ghi chú tùy chọn: hệ thống cho xem trước rồi lưu nguyên từng dòng tại **Lịch rảnh**. Đặt mốc tuần học, ngày bắt đầu, giờ hai ca và tháng cần xếp, rồi bấm **Áp dụng và xếp lịch nháp**. Người chưa có MSSV được tạo hồ sơ theo tên, chờ BĐH bổ sung MSSV tại **Thành viên → Chỉnh sửa** trước khi cấp tài khoản.
5. Đặt A/B/C/D và ngày trực trong **Cài đặt CLB**. D là mức trừ mỗi lượt BĐH tích đi muộn, đang áp dụng 5 điểm; BĐH có thể sửa theo tháng bắt đầu áp dụng.
6. Chọn tháng, **Xếp lịch nháp**, kiểm tra các ca thiếu người, chỉnh hoặc bỏ ca nghỉ, rồi **Công bố lịch**.
7. Trong **Họp hằng tuần**, đặt ngày họp trong tuần tự mở; BĐH tích vắng thực tế/có phép/qua quy chế và chốt.
8. Sau khi xác minh với thầy cô, mở từng ca để ghi nhận kết quả trực hoặc đổi người thay. Người trực thay chỉ được cộng A sau khi xác minh đã trực.
   Nếu buổi trực không diễn ra, BĐH mở ca và bấm **Hủy cả ca** một lần cho cả hai người. Ca hủy không cộng/trừ điểm; **Khôi phục ca** đưa lại đúng phân công và kết quả trước khi hủy. Cách này áp dụng cho cả lịch nháp và lịch đã công bố.
9. Vào **Báo cáo tháng → Xuất Excel**. Có dữ liệu thiếu thì tệp ghi rõ BẢN TẠM. Tệp gồm Tổng hợp tháng, Chi tiết họp, Chi tiết trực, Quy tắc điểm.

## Quy tắc đã triển khai

- Tuần thứ Hai–Chủ nhật theo Asia/Ho_Chi_Minh. Ngày họp quyết định tháng của họp và quy chế; ngày trực quyết định tháng của trực.
- Chưa đăng ký / Tham gia / Xin vắng / Chưa xử lý là bốn nhóm riêng. Xin vắng cần lý do. Đổi từ vắng sang tham gia cần BĐH duyệt.
- Chốt thủ công hoặc tự chốt chuyển Chưa đăng ký và Chưa xử lý thành vắng. Yêu cầu đang chờ giữ lý do và tình trạng có phép ban đầu.
- Mặc định lý do xin vắng được xem là có phép, BĐH có thể đổi lại. Chưa đăng ký không có lý do chuyển vắng không phép khi chốt.
- BĐH rà soát người đăng ký nhưng không đến bằng ô Vắng. Đăng ký tham gia chưa bị tích vắng được xem là có mặt khi chốt.
- Hai ca trực/người/tháng là **mức ưu tiên, không phải giới hạn**. Chia lượt đầu và lượt thứ hai trước khi phân thêm; khi có người muốn trực thêm, ưu tiên họ cho các lượt vượt mức.
- Xếp hai người/ca, sáng và chiều, theo lịch rảnh. Thuật toán gợi ý dùng cách chọn ca khó xếp trước và ưu tiên lượt ít; không cam kết tối ưu toán học toàn cục. Ca thiếu vẫn hiển thị để BĐH chỉnh.
- Lịch rảnh theo mẫu MSSV thay thế dữ liệu rảnh cố định cũ, không sửa lịch đã công bố. Lịch đã công bố chỉ chỉnh từng ca để giữ kết quả xác minh. Bản Excel chi tiết theo tuần học được lưu riêng cho BĐH xem và lọc, không tạo MSSV hay tài khoản giả. Bản chi tiết được giữ lại khi chuyển từ dữ liệu mẫu sang dữ liệu thật.
- Mốc đang áp dụng: tuần học 11 là 09–15/11/2026; sáng 08:30–11:30, chiều 14:00–17:30. Đọc tuần theo khoảng, danh sách hoặc trừ tuần. Chỉ chọn người rảnh tới hết ca và bắt đầu không muộn quá 30 phút; các khoảng liên tiếp trong cùng ngày được gộp. Không coi 08:00–10:00 là rảnh cả ca sáng. Cột ghi chú cuối file được bỏ qua khi xếp lịch theo yêu cầu BĐH.
- Bảng **Theo dõi trực và đến muộn** cho BĐH nhập ghi chú và tích Đến muộn sau khi công bố. Tích ô sẽ trừ D điểm; bỏ tích sẽ hoàn lại khoản trừ đó. Không có ô miễn trừ: nếu lý do hợp lệ, BĐH xem ghi chú và không tích Đến muộn. Nội dung ghi chú không tự thay đổi điểm hoặc ô tích. Ghi chú dự kiến cho người rảnh từ 14:30 không tự tích kết quả đến muộn thực tế.
- Điểm = A × trực đủ − B × vắng trực không phép − C × vắng họp không phép − D × đi muộn. Điểm A/B tính theo kết quả xác minh; D tính riêng ngay khi BĐH tích trên lịch đã công bố. Bản nháp không tính điểm. Ca vắng hoặc hủy sẽ bỏ ô đến muộn để tránh trừ chồng. Excel có số lượt và số điểm trừ đi muộn ở cả tổng hợp và chi tiết.
- Thành viên mới không bị tính vắng các tuần trước. Ngừng hoạt động vẫn giữ lịch sử và báo cáo tháng liên quan.
- Sửa kết quả họp đã chốt cần lý do. BĐH không thể hạ quyền hoặc ngừng hoạt động chủ quản trị.
- Dữ liệu lưu ở Cloudflare D1, không phụ thuộc trình duyệt. Cập nhật có kiểm tra phiên bản để tránh hai BĐH ghi đè.

## Tự động chốt tuần

`POST /api/maintenance` không nhận đầu vào. Nó chỉ đồng bộ lịch theo giờ Việt Nam, đóng các tuần đã hết hạn và mở tuần hiện tại. JSON trả về `ok`, `changed`, `currentWeek`, `timezone`. Có thể gọi lại an toàn.

Website mở công khai; người dùng đăng nhập bằng tài khoản CLB để xem và sửa dữ liệu cá nhân. Mật khẩu được lưu dưới dạng PBKDF2-SHA256 với salt riêng; phiên đăng nhập dùng cookie HttpOnly, Secure trên HTTPS, và chỉ lưu hash token trong cơ sở dữ liệu. Có giới hạn số lần thử đăng nhập. Các biến bí mật `INITIAL_ADMIN_PASSWORD`, `INITIAL_MEMBER_PASSWORD` chỉ dùng để khởi tạo tài khoản ban đầu; không đặt lại mật khẩu đã được đổi. Mọi người có thể tự đổi mật khẩu trong menu; BĐH có thể cấp lại mật khẩu cho thành viên. Để thử hai vai trò song song, mở admin ở cửa sổ thường và member ở cửa sổ ẩn danh. Tác vụ đám mây liên kết gọi endpoint lúc 00:00 thứ Hai, lấy quyền truy cập dịch vụ từ công cụ Sites tại mỗi lần chạy; không ghi token vào mã nguồn hoặc lịch. Mỗi lần đọc/ghi của người dùng cũng đồng bộ lịch để khôi phục khi tác vụ chưa chạy. Nếu không truy cập nhiều tuần, hệ thống bù các tuần bị bỏ qua; BĐH phải bổ sung ngày họp hoặc đánh dấu nghỉ trước khi báo cáo.

## Phát triển

Mèo Bông dùng tranh SVG tự vẽ (`components/furball-art.tsx`), tham khảo phong cách
mèo tròn mềm của [Pet Furball](https://ddrkirbyisq.itch.io/pet-furball), không dùng
mã nguồn hay tài sản của trò chơi. `lib/screen-pet.ts` xử lý chuyển động toàn màn
hình, theo chuột, vuốt ve, giữ để bóp mềm, kéo/thả và quán tính. Menu cạnh mèo có
cho ăn, chơi bóng, lăn, mưa nhỏ, sấy khô và ngủ/đánh thức. Âm thanh tổng hợp chỉ
bật khi người dùng chọn; có thể ẩn/gọi mèo. Hai tùy chọn này lưu trên trình duyệt.
Nhân vật né điều khiển, hỗ trợ cảm ứng/bàn phím, giữ vị trí khi đổi trang, dừng
khi tab/pet bị ẩn và tôn trọng giảm chuyển động. Không dùng WebGL, Sylva hoặc
dữ liệu máy chủ cho pet; dữ liệu và điểm CLB độc lập hoàn toàn.

Node >=22.13; React 19; Vinext/Vite; Cloudflare Workers + D1; ExcelJS; CSS đáp ứng; Lucide.

```text
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_true_mongu.sql
npm run dev
```

Chỉ áp dụng migration một lần cho mỗi cơ sở dữ liệu. Mở URL do máy chủ in ra. Khi chạy local, thêm `INITIAL_ADMIN_PASSWORD` và `INITIAL_MEMBER_PASSWORD` vào `.dev.vars` (tệp đã được bỏ qua bởi Git); dùng giá trị thử riêng, không dùng mật khẩu production. Migration `0001_loose_moon_knight.sql` cần được áp dụng sau `0000_true_mongu.sql` cho cơ sở dữ liệu local.

```text
node scripts/test-club.mjs
node node_modules/typescript/bin/tsc --noEmit
node tests/native-flow.mjs
```

Migration chỉ khai báo cấu trúc. Dữ liệu mẫu chỉ được BĐH chủ động nạp trong ứng dụng, không nằm trong migration. `.openai/hosting.json` giữ ID Site; không tái sử dụng ID khi dựng Site độc lập khác.

Kiểm thử `tests/native-flow.mjs` chỉ chấp nhận máy chủ loopback. Nó dùng dữ liệu thử local, kiểm tra đăng nhập hai vai trò, phân quyền, gửi/duyệt yêu cầu, đăng ký, cấp mật khẩu, đổi mật khẩu và thu hồi phiên. Không chạy bộ fixture này trên production.
