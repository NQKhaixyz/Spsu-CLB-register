# Nhịp CLB

Website quản lý họp tuần, quy chế, lịch trực C1 và báo cáo Excel theo tháng.

## Bắt đầu sử dụng

1. Mở website và đăng nhập bằng MSSV/tên đăng nhập cùng mật khẩu CLB. Không cần tài khoản OpenAI. Hai tài khoản khởi tạo là `admin` (BCS) và `member` (thành viên thử); mật khẩu được cấu hình riêng trong bí mật runtime, không nằm trong mã nguồn. Quyền BCS của tài khoản chủ được giữ nguyên khi chuyển từ cách đăng nhập cũ.
2. Có thể chọn **Xem dữ liệu mẫu** để trải nghiệm. Dữ liệu mẫu được đánh dấu rõ. Khi sẵn sàng, vào **Cài đặt CLB → Xóa dữ liệu mẫu** để bắt đầu danh sách thật, giữ tài khoản BCS.
3. Vào **Thành viên → Nhập Excel**, tải file mẫu rồi nhập danh sách. BCS bấm **Mật khẩu** ở dòng thành viên để cấp tài khoản. Thành viên chưa có trong danh sách có thể tự đăng ký bằng họ tên, MSSV và mật khẩu; tài khoản tự đăng ký luôn có quyền thành viên.
4. Vào **Lịch trực C1 → Nhập lịch rảnh**, dùng file mẫu. Cột ca rảnh nhận 1/x/có/rảnh; ca bận để trống hoặc 0. Cột cuối ghi nguyện vọng trực thêm.
5. Đặt A/B/C và ngày trực trong **Cài đặt CLB**. D để dự phòng, luôn 0. Mặc định hệ số thật bằng 0 cho đến khi BCS cấu hình.
6. Chọn tháng, **Xếp lịch nháp**, kiểm tra các ca thiếu người, chỉnh hoặc bỏ ca nghỉ, rồi **Công bố lịch**.
7. Trong **Họp hằng tuần**, đặt ngày họp trong tuần tự mở; BCS tích vắng thực tế/có phép/qua quy chế và chốt.
8. Sau khi xác minh với thầy cô, mở từng ca để ghi nhận kết quả trực hoặc đổi người thay. Người trực thay chỉ được cộng A sau khi xác minh đã trực.
9. Vào **Báo cáo tháng → Xuất Excel**. Có dữ liệu thiếu thì tệp ghi rõ BẢN TẠM. Tệp gồm Tổng hợp tháng, Chi tiết họp, Chi tiết trực, Quy tắc điểm.

## Quy tắc đã triển khai

- Tuần thứ Hai–Chủ nhật theo Asia/Ho_Chi_Minh. Ngày họp quyết định tháng của họp và quy chế; ngày trực quyết định tháng của trực.
- Chưa đăng ký / Tham gia / Xin vắng / Chưa xử lý là bốn nhóm riêng. Xin vắng cần lý do. Đổi từ vắng sang tham gia cần BCS duyệt.
- Chốt thủ công hoặc tự chốt chuyển Chưa đăng ký và Chưa xử lý thành vắng. Yêu cầu đang chờ giữ lý do và tình trạng có phép ban đầu.
- Mặc định lý do xin vắng được xem là có phép, BCS có thể đổi lại. Chưa đăng ký không có lý do chuyển vắng không phép khi chốt.
- BCS rà soát người đăng ký nhưng không đến bằng ô Vắng. Đăng ký tham gia chưa bị tích vắng được xem là có mặt khi chốt.
- Hai ca trực/người/tháng là **mức ưu tiên, không phải giới hạn**. Chia lượt đầu và lượt thứ hai trước khi phân thêm; khi có người muốn trực thêm, ưu tiên họ cho các lượt vượt mức.
- Xếp hai người/ca, sáng và chiều, theo lịch rảnh. Thuật toán gợi ý dùng cách chọn ca khó xếp trước và ưu tiên lượt ít; không cam kết tối ưu toán học toàn cục. Ca thiếu vẫn hiển thị để BCS chỉnh.
- Lịch rảnh mới thay thế dữ liệu rảnh cũ, không sửa lịch đã công bố. Lịch đã công bố chỉ chỉnh từng ca để giữ kết quả xác minh.
- Điểm = A × trực đủ − B × vắng trực không phép − C × vắng họp không phép. Quy chế không cộng/trừ. Bản nháp và ca chưa xác minh không tính điểm.
- Thành viên mới không bị tính vắng các tuần trước. Ngừng hoạt động vẫn giữ lịch sử và báo cáo tháng liên quan.
- Sửa kết quả họp đã chốt cần lý do. BCS không thể hạ quyền hoặc ngừng hoạt động chủ quản trị.
- Dữ liệu lưu ở Cloudflare D1, không phụ thuộc trình duyệt. Cập nhật có kiểm tra phiên bản để tránh hai BCS ghi đè.

## Tự động chốt tuần

`POST /api/maintenance` không nhận đầu vào. Nó chỉ đồng bộ lịch theo giờ Việt Nam, đóng các tuần đã hết hạn và mở tuần hiện tại. JSON trả về `ok`, `changed`, `currentWeek`, `timezone`. Có thể gọi lại an toàn.

Website mở công khai; người dùng đăng nhập bằng tài khoản CLB để xem và sửa dữ liệu cá nhân. Mật khẩu được lưu dưới dạng PBKDF2-SHA256 với salt riêng; phiên đăng nhập dùng cookie HttpOnly, Secure trên HTTPS, và chỉ lưu hash token trong cơ sở dữ liệu. Có giới hạn số lần thử đăng nhập. Các biến bí mật `INITIAL_ADMIN_PASSWORD`, `INITIAL_MEMBER_PASSWORD` chỉ dùng để khởi tạo tài khoản ban đầu; không đặt lại mật khẩu đã được đổi. Mọi người có thể tự đổi mật khẩu trong menu; BCS có thể cấp lại mật khẩu cho thành viên. Để thử hai vai trò song song, mở admin ở cửa sổ thường và member ở cửa sổ ẩn danh. Tác vụ đám mây liên kết gọi endpoint lúc 00:00 thứ Hai, lấy quyền truy cập dịch vụ từ công cụ Sites tại mỗi lần chạy; không ghi token vào mã nguồn hoặc lịch. Mỗi lần đọc/ghi của người dùng cũng đồng bộ lịch để khôi phục khi tác vụ chưa chạy. Nếu không truy cập nhiều tuần, hệ thống bù các tuần bị bỏ qua; BCS phải bổ sung ngày họp hoặc đánh dấu nghỉ trước khi báo cáo.

## Phát triển

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

Migration chỉ khai báo cấu trúc. Dữ liệu mẫu chỉ được BCS chủ động nạp trong ứng dụng, không nằm trong migration. `.openai/hosting.json` giữ ID Site; không tái sử dụng ID khi dựng Site độc lập khác.

Kiểm thử `tests/native-flow.mjs` chỉ chấp nhận máy chủ loopback. Nó dùng dữ liệu thử local, kiểm tra đăng nhập hai vai trò, phân quyền, gửi/duyệt yêu cầu, đăng ký, cấp mật khẩu, đổi mật khẩu và thu hồi phiên. Không chạy bộ fixture này trên production.
