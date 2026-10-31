import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../lib/actions";
import { createClub, type AvailabilityDataset } from "../lib/club";
import { workspaceView } from "../lib/workspace-view";

const owner = {userId:"workspace-regression-owner",displayName:"BĐH",email:""};
function fixture() {
  const c=createClub(owner.userId);
  applyAction(c,owner,"profile",{name:"BĐH",studentId:"BCS001"});
  applyAction(c,owner,"member",{name:"Mai Lan",studentId:"TEMP001"});
  const pending=c.members[1]; pending.studentId=""; pending.needsStudentId=true;
  const dataset: AvailabilityDataset = {filename:"source.xlsx",importedAt:"2026-10-31",importedBy:"BĐH",rows:[{sourceRow:2,name:"Mai Lan",day:"Thứ 2",period:"Sáng",weeks:"11-18",note:"Thông tin lịch rảnh"}],memberLinks:{"mai lan":pending.id}};
  c.availabilityDataset=structuredClone(dataset);
  c.activeAvailabilityDataset=structuredClone(dataset);
  return {c,pending};
}
test("Member response removes both staged and active source datasets without modifying admin state",()=>{
  const {c,pending}=fixture(); pending.userId="workspace-member";
  const before=JSON.stringify(c);
  const member=workspaceView(c,{userId:pending.userId,displayName:pending.name,email:""},5);
  assert.equal(member.club.availabilityDataset,undefined);
  assert.equal(member.club.activeAvailabilityDataset,undefined);
  assert.equal(member.club.ownerId,"");
  assert.deepEqual(member.club.logs,[]);
  assert.equal(JSON.stringify(c),before);
  assert.ok(workspaceView(c,owner,5).club.activeAvailabilityDataset);
});
test("BĐH roster imports and manual additions cannot duplicate a source profile pending MSSV",()=>{
  const {c,pending}=fixture();
  assert.throws(()=>applyAction(c,owner,"import",{kind:"members",rows:[{name:"MAI   LAN",studentId:"REAL001"}]}),/đang chờ MSSV/);
  assert.throws(()=>applyAction(c,owner,"member",{name:"Mai Lan",studentId:"REAL001"}),/hồ sơ chờ MSSV/);
  assert.equal(c.members.length,2);
  applyAction(c,owner,"member",{memberId:pending.id,studentId:"REAL001"});
  applyAction(c,owner,"import",{kind:"members",rows:[{name:"Mai Lan",studentId:"REAL001"}]});
  assert.equal(c.members.length,2);
  assert.equal(c.activeAvailabilityDataset?.memberLinks?.["mai lan"],pending.id);
});
test("BĐH cannot enter reserved logins as MSSVs for pending or new members",()=>{
  const {c,pending}=fixture();
  for(const studentId of ["admin","MEMBER"]){
    assert.throws(()=>applyAction(c,owner,"member",{memberId:pending.id,studentId}),/dành riêng/);
    assert.throws(()=>applyAction(c,owner,"import",{kind:"members",rows:[{name:"New Person",studentId}]}),/dành riêng/);
  }
  assert.equal(pending.studentId,"");
});

test("Legacy role wording updates for display while identifiers and stored records stay intact",()=>{
  const {c}=fixture();
  c.members[0].name="Ban cán sự";
  c.members[0].loginName="BCS";
  c.logs=[{at:"2026-10-31",actor:"Ban cán sự",text:"BCS chấp thuận"}];
  c.weeks[0].entries[0].decision="BCS chấp thuận";
  const before=JSON.stringify(c);
  const view=workspaceView(c,{...owner,displayName:"Ban cán sự"},5);
  assert.equal(view.me?.name,"Ban điều hành");
  assert.equal(view.identity.name,"Ban điều hành");
  assert.equal(view.me?.loginName,"BCS");
  assert.equal(view.me?.studentId,"BCS001");
  assert.equal(view.club.logs[0].text,"BĐH chấp thuận");
  assert.equal(view.club.logs[0].actor,"Ban điều hành");
  assert.equal(view.club.weeks[0].entries[0].decision,"BĐH chấp thuận");
  assert.equal(JSON.stringify(c),before);
});
